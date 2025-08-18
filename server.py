import http.server
import socketserver
import json
import sqlite3
import os
from urllib.parse import urlparse, parse_qs
import hashlib
import hmac
import base64
from datetime import datetime, timedelta
import time # For Unix timestamp

# Import functions from user_manager
from user_manager import verify_user, _init_auth_db

# Define the port number the server will listen on.
PORT = 12345

# Define the SQLite database file path.
DB_FILE = "./data/tasks.db"

# Secret key for JWT. In a real application, this should be loaded from
# an environment variable or a secure configuration management system.
# DO NOT expose this in source control in production.
SECRET_KEY = "your_super_secret_jwt_key_please_change_this!".encode('utf-8') # Must be bytes for hmac

# --- JWT Helper Functions (Manual Implementation) ---

def _base64url_encode(data):
    """Encodes bytes to Base64Url string."""
    encoded = base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')
    return encoded

def _base64url_decode(data):
    """Decodes Base64Url string to bytes."""
    padding = '=' * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data + padding)

def _generate_jwt(payload_data, secret):
    """Generates a JWT manually."""
    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _base64url_encode(json.dumps(header).encode('utf-8'))
    encoded_payload = _base64url_encode(json.dumps(payload_data).encode('utf-8'))

    signing_input = f"{encoded_header}.{encoded_payload}".encode('utf-8')
    signature = hmac.new(secret, signing_input, hashlib.sha256).digest()
    encoded_signature = _base64url_encode(signature)

    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"

def _verify_jwt(token, secret):
    """Verifies a JWT manually and returns the payload if valid."""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None # Invalid JWT format

        encoded_header, encoded_payload, received_signature = parts

        # Recompute signature
        signing_input = f"{encoded_header}.{encoded_payload}".encode('utf-8')
        expected_signature_bytes = hmac.new(secret, signing_input, hashlib.sha256).digest()
        expected_signature = _base64url_encode(expected_signature_bytes)

        if not hmac.compare_digest(received_signature.encode('utf-8'), expected_signature.encode('utf-8')):
            return None # Signature mismatch

        # Decode payload
        payload_bytes = _base64url_decode(encoded_payload)
        payload = json.loads(payload_bytes)

        # Check expiration
        if 'exp' in payload:
            if datetime.utcfromtimestamp(payload['exp']) < datetime.utcnow():
                print("Token expired.")
                return None # Token expired

        return payload
    except Exception as e:
        print(f"JWT verification error: {e}")
        return None

# --- Database Initialization ---

def _init_db():
    """Initializes the SQLite database and creates tables if they don't exist."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Enable WAL mode for better concurrency
    cursor.execute("PRAGMA journal_mode=WAL;")

    # Create tasks table
    # Storing categories and attachments as JSON strings
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            creator TEXT NOT NULL,
            title TEXT,
            "from" TEXT,
            priority INTEGER,
            deadline TEXT,
            finishDate TEXT,
            status TEXT,
            description TEXT,
            notes TEXT,
            categories TEXT,
            attachments TEXT,
            updatedAt TEXT
        )
    ''')

    # Create milestones table
    # Storing notes as JSON string
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS milestones (
            id TEXT PRIMARY KEY,
            taskId TEXT NOT NULL,
            title TEXT,
            deadline TEXT,
            finishDate TEXT,
            status TEXT,
            parentId TEXT,
            notes TEXT,
            updatedAt TEXT,
            FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
        )
    ''')

    conn.commit()
    conn.close()
    print(f"SQLite database initialized at: {os.path.abspath(DB_FILE)}")

class SimpleTaskServerHandler(http.server.SimpleHTTPRequestHandler):

    def _send_response(self, status_code, content_type="text/plain", body=""):
        """Helper function to send an HTTP response."""
        self.send_response(status_code)
        self.send_header("Content-type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*") # Allow CORS for development
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        if isinstance(body, str):
            self.wfile.write(body.encode("utf-8"))
        else: # Assuming bytes or JSON
            self.wfile.write(body)

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self._send_response(200)

    def _is_safe_path(self, path_segment):
        """
        Checks if a path segment is safe for use in a URL or query parameter.
        While no longer used for file paths directly, this is good practice for sanitizing inputs.
        """
        if not path_segment:
            return False
        # Disallow segments that are or contain '..' or are a path separator
        if '..' in path_segment or '/' in path_segment or '\\' in path_segment:
            return False
        # Also disallow segments that start with a dot, to prevent ambiguity or hidden values
        if path_segment.startswith('.'):
            return False
        return True

    def _get_authenticated_username(self):
        """
        Extracts and verifies the JWT from the Authorization header.
        Returns the username if valid, None otherwise.
        """
        auth_header = self.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            self._send_response(401, "application/json", json.dumps({"error": "Authentication required."}).encode('utf-8'))
            return None

        token = auth_header.split(' ')[1]
        payload = _verify_jwt(token, SECRET_KEY)

        if payload:
            return payload.get('username')
        else:
            # _verify_jwt already handles sending 401 if token is invalid or expired
            return None

    def do_POST(self):
        """Handles POST requests, specifically for login."""
        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        if len(path_segments) == 1 and path_segments[0] == "login":
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length).decode('utf-8')
                credentials = json.loads(post_data)
                username = credentials.get('username')
                password = credentials.get('password')

                if not username or not password:
                    self._send_response(400, "application/json", json.dumps({"error": "Username and password are required."}).encode('utf-8'))
                    return

                if verify_user(username, password):
                    # Generate JWT payload
                    token_payload = {
                        'username': username,
                        'exp': int(time.time() + 3600) # Token expires in 1 hour (Unix timestamp)
                    }
                    token = _generate_jwt(token_payload, SECRET_KEY)
                    self._send_response(200, "application/json", json.dumps({"token": token, "username": username}).encode('utf-8'))
                else:
                    self._send_response(401, "application/json", json.dumps({"error": "Invalid credentials."}).encode('utf-8'))
            except json.JSONDecodeError:
                self._send_response(400, "application/json", json.dumps({"error": "Invalid JSON format."}).encode('utf-8'))
            except Exception as e:
                self._send_response(500, "application/json", json.dumps({"error": f"Server error during login: {e}"}).encode('utf-8'))
        else:
            # For other POST requests, if any, fall back to default or handle them
            super().do_POST() # This might need more specific handling depending on future POST needs


    def do_PUT(self):
        """Handles PUT requests for saving task or milestone data."""
        username = self._get_authenticated_username()
        if not username:
            # _get_authenticated_username already sends 401/500 response
            return

        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        conn = None
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(post_data)

            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()

            # Save Task: /save-task/<task-id> (username now from auth)
            if len(path_segments) == 2 and path_segments[0] == "save-task":
                task_id = path_segments[1]

                if not self._is_safe_path(task_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid task ID. Input segments cannot contain '..', '.' or path separators."}))
                    return

                # Serialize list/dict fields to JSON strings
                categories_json = json.dumps(data.get('categories', []))
                attachments_json = json.dumps(data.get('attachments', []))

                cursor.execute('''
                    INSERT OR REPLACE INTO tasks (
                        id, creator, title, "from", priority, deadline, finishDate, status,
                        description, notes, categories, attachments, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    task_id, username, data.get('title'), data.get('from'), data.get('priority'),
                    data.get('deadline'), data.get('finishDate'), data.get('status'),
                    data.get('description'), data.get('notes'), categories_json, attachments_json,
                    data.get('updatedAt')
                ))
                conn.commit()
                self._send_response(200, "application/json", json.dumps({"message": f"Task '{task_id}' for user '{username}' saved successfully."}).encode('utf-8'))

            # Save Milestone: /save-milestone/<task-id>/<milestone-id> (username now from auth)
            elif len(path_segments) == 3 and path_segments[0] == "save-milestone":
                task_id = path_segments[1]
                milestone_id = path_segments[2]

                if not self._is_safe_path(task_id) or not self._is_safe_path(milestone_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid task ID or milestone ID. Input segments cannot contain '..', '.' or path separators."}).encode('utf-8'))
                    return

                # Ensure the task belongs to the authenticated user before saving its milestone
                cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (task_id, username))
                if not cursor.fetchone():
                    self._send_response(403, "application/json", json.dumps({"error": f"Unauthorized: Task '{task_id}' not found or not owned by '{username}'."}).encode('utf-8'))
                    return


                # Serialize notes to JSON string (if notes can contain rich text/complex objects)
                notes_json = json.dumps(data.get('notes', '')) # Store notes as JSON string

                cursor.execute('''
                    INSERT OR REPLACE INTO milestones (
                        id, taskId, title, deadline, finishDate, status, parentId, notes, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    milestone_id, task_id, data.get('title'), data.get('deadline'),
                    data.get('finishDate'), data.get('status'), data.get('parentId'),
                    notes_json, data.get('updatedAt')
                ))
                conn.commit()
                self._send_response(200, "application/json", json.dumps({"message": f"Milestone '{milestone_id}' for task '{task_id}' saved successfully."}).encode('utf-8'))
            else:
                self._send_response(404, "application/json", json.dumps({"error": "Endpoint not found."}).encode('utf-8'))

        except json.JSONDecodeError:
            self._send_response(400, "application/json", json.dumps({"error": "Invalid JSON format."}).encode('utf-8'))
        except sqlite3.Error as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Database error: {e}"}).encode('utf-8'))
        except Exception as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}).encode('utf-8'))
        finally:
            if conn:
                conn.close()

    def do_GET(self):
        """Handles GET requests for loading task or milestone data, including filtered task summaries."""
        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        # Static files should not require authentication
        if path_segments[0] not in ["load-task", "load-milestones", "load-milestone", "load-tasks-summary", "login"]:
            super().do_GET()
            return

        # Authenticate all data retrieval endpoints
        username = self._get_authenticated_username()
        if not username:
            # _get_authenticated_username already handles sending 401/500 response
            return

        conn = None
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()

            # Load Task Summary (for left menu with filters): /load-tasks-summary
            if len(path_segments) == 1 and path_segments[0] == "load-tasks-summary":
                query_params = parse_qs(parsed_path.query)

                search_query = query_params.get('q', [''])[0].lower()
                selected_categories = query_params.get('categories', [''])[0].split(',')
                selected_statuses = query_params.get('statuses', [''])[0].split(',')
                sort_by = query_params.get('sortBy', ['updatedAt'])[0]
                created_from = query_params.get('createdRF', [''])[0]
                created_to = query_params.get('createdRT', [''])[0]
                updated_from = query_params.get('updatedRF', [''])[0]
                updated_to = query_params.get('updatedRT', [''])[0]
                deadline_from = query_params.get('deadlineRF', [''])[0]
                deadline_to = query_params.get('deadlineRT', [''])[0]
                finished_from = query_params.get('finishedRF', [''])[0]
                finished_to = query_params.get('finishedRT', [''])[0]

                sql_query = """
                    SELECT
                        id, creator, title, "from", priority, deadline, finishDate, status, categories, updatedAt
                    FROM
                        tasks
                    WHERE
                        creator = ?
                """
                query_args = [username]

                # Apply search filter
                if search_query:
                    sql_query += " AND (LOWER(title) LIKE ? OR LOWER(\"from\") LIKE ?)"
                    query_args.extend([f'%{search_query}%', f'%{search_query}%'])

                # Apply category filter
                if selected_categories and selected_categories != ['']:
                    category_conditions = []
                    for cat in selected_categories:
                        # Check if the JSON string of categories contains the selected category
                        category_conditions.append(f"categories LIKE ?")
                        query_args.append(f'%"{cat}"%') # For JSON array matching
                    if category_conditions:
                        sql_query += " AND (" + " OR ".join(category_conditions) + ")"

                # Apply status filter
                if selected_statuses and selected_statuses != ['']:
                    status_placeholders = ','.join('?' * len(selected_statuses))
                    sql_query += f" AND status IN ({status_placeholders})"
                    query_args.extend(selected_statuses)

                # Apply date filters
                def add_date_filter(column_name, from_date, to_date):
                    nonlocal sql_query, query_args
                    if from_date and to_date:
                        sql_query += f" AND {column_name} BETWEEN ? AND ?"
                        query_args.extend([from_date, to_date + 'T23:59:59.999Z']) # Include full end day
                    elif from_date:
                        sql_query += f" AND {column_name} >= ?"
                        query_args.append(from_date)
                    elif to_date:
                        sql_query += f" AND {column_name} <= ?"
                        query_args.append(to_date + 'T23:59:59.999Z')

                add_date_filter('createdAt', created_from, created_to)
                add_date_filter('updatedAt', updated_from, updated_to)
                add_date_filter('deadline', deadline_from, deadline_to)
                # For finishDate, only include tasks with a finishDate if a range is provided
                if finished_from or finished_to:
                    if not finished_from and not finished_to: # If both empty, then all finished tasks.
                        sql_query += " AND finishDate IS NOT NULL"
                    elif finished_from and finished_to:
                        sql_query += " AND finishDate BETWEEN ? AND ?"
                        query_args.extend([finished_from, finished_to + 'T23:59:59.999Z'])
                    elif finished_from:
                        sql_query += " AND finishDate >= ?"
                        query_args.append(finished_from)
                    elif finished_to:
                        sql_query += " AND finishDate <= ?"
                        query_args.append(finished_to + 'T23:59:59.999Z')
                # If neither finished_from nor finished_to are provided, we don't filter by finishedDate here.

                # Apply sorting
                order_clause = ""
                if sort_by == 'deadline':
                    order_clause = " ORDER BY CASE WHEN deadline IS NULL THEN 1 ELSE 0 END, deadline ASC"
                elif sort_by == 'priority':
                    order_clause = " ORDER BY priority ASC"
                elif sort_by == 'from':
                    order_clause = " ORDER BY \"from\" ASC"
                else: # Default or 'updatedAt'
                    order_clause = " ORDER BY updatedAt DESC"
                
                sql_query += order_clause
                
                cursor.execute(sql_query, query_args)
                rows = cursor.fetchall()

                tasks_summary = []
                columns = [description[0] for description in cursor.description]
                for row in rows:
                    task_data = dict(zip(columns, row))
                    if 'categories' in task_data and task_data['categories']:
                        try:
                            task_data['categories'] = json.loads(task_data['categories'])
                        except json.JSONDecodeError:
                            task_data['categories'] = [] # Handle malformed JSON
                    tasks_summary.append(task_data)

                self._send_response(200, "application/json", json.dumps(tasks_summary, indent=4).encode('utf-8'))


            # Load Task: /load-task/<task-id>
            elif len(path_segments) == 2 and path_segments[0] == "load-task":
                task_id = path_segments[1]

                if not self._is_safe_path(task_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid task ID. Input segments cannot contain '..', '.' or path separators."}).encode('utf-8'))
                    return

                cursor.execute("SELECT * FROM tasks WHERE id = ? AND creator = ?", (task_id, username))
                row = cursor.fetchone()

                if row:
                    # Column names from pragma
                    columns = [description[0] for description in cursor.description]
                    task_data = dict(zip(columns, row))
                    # Deserialize JSON string fields back to Python objects
                    if 'categories' in task_data and task_data['categories']:
                        task_data['categories'] = json.loads(task_data['categories'])
                    if 'attachments' in task_data and task_data['attachments']:
                        task_data['attachments'] = json.loads(task_data['attachments'])
                    self._send_response(200, "application/json", json.dumps(task_data, indent=4).encode('utf-8'))
                else:
                    self._send_response(404, "application/json", json.dumps({"error": f"Task '{task_id}' for user '{username}' not found."}).encode('utf-8'))

            # Load Milestones for a Task: /load-milestones/<task-id>
            elif len(path_segments) == 2 and path_segments[0] == "load-milestones":
                task_id = path_segments[1]

                if not self._is_safe_path(task_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid task ID. Input segments cannot contain '..', '.' or path separators."}).encode('utf-8'))
                    return

                # Ensure the task exists and belongs to the user (security check)
                cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (task_id, username))
                if not cursor.fetchone():
                    self._send_response(404, "application/json", json.dumps({"error": f"Task '{task_id}' for user '{username}' not found or unauthorized."}).encode('utf-8'))
                    return

                cursor.execute("SELECT * FROM milestones WHERE taskId = ?", (task_id,))
                rows = cursor.fetchall()

                milestones = []
                columns = [description[0] for description in cursor.description]
                for row in rows:
                    milestone_data = dict(zip(columns, row))
                    # Deserialize notes field
                    if 'notes' in milestone_data and milestone_data['notes']:
                        milestone_data['notes'] = json.loads(milestone_data['notes'])
                    milestones.append(milestone_data)

                self._send_response(200, "application/json", json.dumps(milestones, indent=4).encode('utf-8'))

            # Load Single Milestone: /load-milestone/<task-id>/<milestone-id>
            elif len(path_segments) == 3 and path_segments[0] == "load-milestone":
                task_id = path_segments[1]
                milestone_id = path_segments[2]

                if not self._is_safe_path(task_id) or not self._is_safe_path(milestone_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid task ID or milestone ID. Input segments cannot contain '..', '.' or path separators."}).encode('utf-8'))
                    return

                # Ensure the task exists and belongs to the user (security check)
                cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (task_id, username))
                if not cursor.fetchone():
                    self._send_response(404, "application/json", json.dumps({"error": f"Task '{task_id}' for user '{username}' not found or unauthorized."}).encode('utf-8'))
                    return

                cursor.execute("SELECT * FROM milestones WHERE id = ? AND taskId = ?", (milestone_id, task_id))
                row = cursor.fetchone()

                if row:
                    columns = [description[0] for description in cursor.description]
                    milestone_data = dict(zip(columns, row))
                    # Deserialize notes field
                    if 'notes' in milestone_data and milestone_data['notes']:
                        milestone_data['notes'] = json.loads(milestone_data['notes'])
                    self._send_response(200, "application/json", json.dumps(milestone_data, indent=4).encode('utf-8'))
                else:
                    self._send_response(404, "application/json", json.dumps({"error": f"Milestone '{milestone_id}' for task '{task_id}' not found."}).encode('utf-8'))

            else:
                self._send_response(404, "application/json", json.dumps({"error": "Endpoint not found."}).encode('utf-8'))


        except sqlite3.Error as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Database error: {e}"}).encode('utf-8'))
        except Exception as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}).encode('utf-8'))
        finally:
            if conn:
                conn.close()

    def do_DELETE(self):
        """Handles DELETE requests for deleting tasks or milestones."""
        username = self._get_authenticated_username()
        if not username:
            # _get_authenticated_username already sends 401/500 response
            return

        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        conn = None
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()

            # Delete Task: /delete-task/<task-id>
            if len(path_segments) == 2 and path_segments[0] == "delete-task":
                task_id = path_segments[1]

                if not self._is_safe_path(task_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid task ID. Input segments cannot contain '..', '.' or path separators."}).encode('utf-8'))
                    return

                # Verify ownership before deleting
                cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (task_id, username))
                if not cursor.fetchone():
                    self._send_response(403, "application/json", json.dumps({"error": "Unauthorized: You can only delete tasks you created."}).encode('utf-8'))
                    return

                cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
                # Due to ON DELETE CASCADE, associated milestones will also be deleted
                conn.commit()
                self._send_response(200, "application/json", json.dumps({"message": f"Task '{task_id}' for user '{username}' deleted successfully."}).encode('utf-8'))

            # Delete Milestone: /delete-milestone/<task-id>/<milestone-id>
            elif len(path_segments) == 3 and path_segments[0] == "delete-milestone":
                task_id = path_segments[1]
                milestone_id = path_segments[2]

                if not self._is_safe_path(task_id) or not self._is_safe_path(milestone_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid task ID or milestone ID. Input segments cannot contain '..', '.' or path separators."}).encode('utf-8'))
                    return

                # Verify task ownership before deleting milestone
                cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (task_id, username))
                if not cursor.fetchone():
                    self._send_response(403, "application/json", json.dumps({"error": "Unauthorized: You can only delete milestones for tasks you created."}).encode('utf-8'))
                    return

                # Before deleting, check if this milestone is a parent to any other milestones
                cursor.execute("SELECT id FROM milestones WHERE parentId = ?", (milestone_id,))
                if cursor.fetchone():
                    self._send_response(409, "application/json", json.dumps({"error": "Cannot delete milestone: it is a parent to other milestones. Please remove its children's parent link first."}).encode('utf-8'))
                    return

                cursor.execute("DELETE FROM milestones WHERE id = ? AND taskId = ?", (milestone_id, task_id))
                conn.commit()
                if cursor.rowcount > 0:
                    self._send_response(200, "application/json", json.dumps({"message": f"Milestone '{milestone_id}' for task '{task_id}' deleted successfully."}).encode('utf-8'))
                else:
                    self._send_response(404, "application/json", json.dumps({"error": f"Milestone '{milestone_id}' for task '{task_id}' not found."}).encode('utf-8'))
            else:
                self._send_response(404, "application/json", json.dumps({"error": "Endpoint not found."}).encode('utf-8'))

        except json.JSONDecodeError:
            self._send_response(400, "application/json", json.dumps({"error": "Invalid JSON format."}).encode('utf-8'))
        except sqlite3.Error as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Database error: {e}"}).encode('utf-8'))
        except Exception as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}).encode('utf-8'))
        finally:
            if conn:
                conn.close()

# Initialize the authentication database first
_init_auth_db()
# Initialize the tasks database
_init_db()


# Create the server using ThreadingTCPServer for concurrent requests.
with socketserver.ThreadingTCPServer(("localhost", PORT), SimpleTaskServerHandler) as httpd:
    os.chdir(".")
    print(f"Serving HTTP on port {PORT}")
    print(f"Access static files at: http://localhost:{PORT}/")
    print(f"Task data will be stored in SQLite database: {os.path.abspath(DB_FILE)}")
    print(f"To save a task (requires JWT Auth): PUT request to http://localhost:{PORT}/save-task/<task-id> with JSON body")
    print(f"To save a milestone (requires JWT Auth): PUT request to http://localhost:{PORT}/save-milestone/<task-id>/<milestone-id> with JSON body")
    print(f"To load a task (requires JWT Auth): GET request to http://localhost:{PORT}/load-task/<task-id>")
    print(f"To load milestones (requires JWT Auth): GET request to http://localhost:{PORT}/load-milestones/<task-id>")
    print(f"To load a single milestone (requires JWT Auth): GET request to http://localhost:{PORT}/load-milestone/<task-id>/<milestone-id>")
    print(f"To delete a task (and its milestones, requires JWT Auth): DELETE request to http://localhost:{PORT}/delete-task/<task-id>")
    print(f"To delete a milestone (requires JWT Auth): DELETE request to http://localhost:{PORT}/delete-milestone/<task-id>/<milestone-id>")
    print(f"To login and get a token: POST request to http://localhost:{PORT}/login with JSON body {'{'} \"username\": \"your_username\", \"password\": \"your_password\" {'}'}")
    # New endpoint for summarized tasks with filters
    print(f"To load summarized tasks with filters (requires JWT Auth): GET request to http://localhost:{PORT}/load-tasks-summary?q=<query>&categories=<cat1,cat2>&statuses=<stat1,stat2>&sortBy=<field>&createdRF=<date>&createdRT=<date>&updatedRF=<date>&updatedRT=<date>&deadlineRF=<date>&deadlineRT=<date>&finishedRF=<date>&finishedRT=<date>")


    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer is shutting down...")
        httpd.shutdown()
        print("Server has been shut down gracefully.")
