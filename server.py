import http.server
import socketserver
import json
import sqlite3
import os
from urllib.parse import urlparse
import hashlib # For potential hashing if not using user_manager directly
import hmac # For secure comparison
import base64

# Import functions from user_manager
from user_manager import verify_user, _init_auth_db # Import _init_auth_db to ensure auth db is initialized

# Define the port number the server will listen on.
PORT = 12345

# Define the SQLite database file path.
DB_FILE = "./data/tasks.db"

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

    def _authenticate_request(self, username, password):
        """
        Authenticates the request using the verify_user function from user_manager.
        Returns True if authentication succeeds, False otherwise.
        """
        return verify_user(username, password)

    def do_PUT(self):
        """Handles PUT requests for saving task or milestone data."""
        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        conn = None
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(post_data)

            # Extract username and password from headers for authentication
            auth_header = self.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Basic '):
                self._send_response(401, "application/json", json.dumps({"error": "Authentication required."}))
                return

            encoded_credentials = auth_header.split(' ')[1]
            decoded_credentials = base64.b64decode(encoded_credentials).decode('utf-8')
            username, password = decoded_credentials.split(':', 1)

            if not self._authenticate_request(username, password):
                self._send_response(401, "application/json", json.dumps({"error": "Invalid credentials."}))
                return

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
                self._send_response(200, "application/json", json.dumps({"message": f"Task '{task_id}' for user '{username}' saved successfully."}))

            # Save Milestone: /save-milestone/<task-id>/<milestone-id> (username now from auth)
            elif len(path_segments) == 3 and path_segments[0] == "save-milestone":
                task_id = path_segments[1]
                milestone_id = path_segments[2]

                if not self._is_safe_path(task_id) or not self._is_safe_path(milestone_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid task ID or milestone ID. Input segments cannot contain '..', '.' or path separators."}))
                    return

                # Ensure the task belongs to the authenticated user before saving its milestone
                cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (task_id, username))
                if not cursor.fetchone():
                    self._send_response(403, "application/json", json.dumps({"error": f"Unauthorized: Task '{task_id}' not found or not owned by '{username}'."}))
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
                self._send_response(200, "application/json", json.dumps({"message": f"Milestone '{milestone_id}' for task '{task_id}' saved successfully."}))
            else:
                self._send_response(404, "application/json", json.dumps({"error": "Endpoint not found."}))

        except json.JSONDecodeError:
            self._send_response(400, "application/json", json.dumps({"error": "Invalid JSON format."}))
        except sqlite3.Error as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Database error: {e}"}))
        except Exception as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}))
        finally:
            if conn:
                conn.close()

    def do_GET(self):
        """Handles GET requests for loading task or milestone data."""
        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        conn = None
        try:
            # Check for authentication header for data retrieval endpoints
            if path_segments[0] in ["load-task", "load-milestones", "load-milestone"]:
                auth_header = self.headers.get('Authorization')
                if not auth_header or not auth_header.startswith('Basic '):
                    self._send_response(401, "application/json", json.dumps({"error": "Authentication required."}).encode('utf-8'))
                    return

                encoded_credentials = auth_header.split(' ')[1]
                decoded_credentials = base64.b64decode(encoded_credentials).decode('utf-8')
                username, password = decoded_credentials.split(':', 1)

                if not self._authenticate_request(username, password):
                    self._send_response(401, "application/json", json.dumps({"error": "Invalid credentials."}).encode('utf-8'))
                    return
            else:
                # For all other GET requests (e.g., static files), no authentication needed
                super().do_GET()
                return

            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()

            # Load Task: /load-task/<task-id>
            if len(path_segments) == 2 and path_segments[0] == "load-task":
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
                # For all other GET requests, serve static files (e.g., HTML, JS)
                super().do_GET()

        except sqlite3.Error as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Database error: {e}"}).encode('utf-8'))
        except Exception as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}).encode('utf-8'))
        finally:
            if conn:
                conn.close()

    def do_DELETE(self):
        """Handles DELETE requests for deleting tasks or milestones."""
        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        conn = None
        try:
            auth_header = self.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Basic '):
                self._send_response(401, "application/json", json.dumps({"error": "Authentication required."}))
                return

            encoded_credentials = auth_header.split(' ')[1]
            decoded_credentials = base64.b64decode(encoded_credentials).decode('utf-8')
            username, password = decoded_credentials.split(':', 1)

            if not self._authenticate_request(username, password):
                self._send_response(401, "application/json", json.dumps({"error": "Invalid credentials."}))
                return

            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()

            # Delete Task: /delete-task/<task-id>
            if len(path_segments) == 2 and path_segments[0] == "delete-task":
                task_id = path_segments[1]

                if not self._is_safe_path(task_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid task ID. Input segments cannot contain '..', '.' or path separators."}))
                    return

                # Verify ownership before deleting
                cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (task_id, username))
                if not cursor.fetchone():
                    self._send_response(403, "application/json", json.dumps({"error": "Unauthorized: You can only delete tasks you created."}))
                    return

                cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
                # Due to ON DELETE CASCADE, associated milestones will also be deleted
                conn.commit()
                self._send_response(200, "application/json", json.dumps({"message": f"Task '{task_id}' for user '{username}' deleted successfully."}))

            # Delete Milestone: /delete-milestone/<task-id>/<milestone-id>
            elif len(path_segments) == 3 and path_segments[0] == "delete-milestone":
                task_id = path_segments[1]
                milestone_id = path_segments[2]

                if not self._is_safe_path(task_id) or not self._is_safe_path(milestone_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid task ID or milestone ID. Input segments cannot contain '..', '.' or path separators."}))
                    return

                # Verify task ownership before deleting milestone
                cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (task_id, username))
                if not cursor.fetchone():
                    self._send_response(403, "application/json", json.dumps({"error": "Unauthorized: You can only delete milestones for tasks you created."}))
                    return

                # Before deleting, check if this milestone is a parent to any other milestones
                cursor.execute("SELECT id FROM milestones WHERE parentId = ?", (milestone_id,))
                if cursor.fetchone():
                    self._send_response(409, "application/json", json.dumps({"error": "Cannot delete milestone: it is a parent to other milestones. Please remove its children's parent link first."}))
                    return

                cursor.execute("DELETE FROM milestones WHERE id = ? AND taskId = ?", (milestone_id, task_id))
                conn.commit()
                if cursor.rowcount > 0:
                    self._send_response(200, "application/json", json.dumps({"message": f"Milestone '{milestone_id}' for task '{task_id}' deleted successfully."}))
                else:
                    self._send_response(404, "application/json", json.dumps({"error": f"Milestone '{milestone_id}' for task '{task_id}' not found."}))
            else:
                self._send_response(404, "application/json", json.dumps({"error": "Endpoint not found."}))

        except json.JSONDecodeError:
            self._send_response(400, "application/json", json.dumps({"error": "Invalid JSON format."}))
        except sqlite3.Error as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Database error: {e}"}))
        except Exception as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}))
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
    print(f"To save a task (requires Basic Auth): PUT request to http://localhost:{PORT}/save-task/<task-id> with JSON body")
    print(f"To save a milestone (requires Basic Auth): PUT request to http://localhost:{PORT}/save-milestone/<task-id>/<milestone-id> with JSON body")
    print(f"To load a task (requires Basic Auth): GET request to http://localhost:{PORT}/load-task/<task-id>")
    print(f"To load milestones (requires Basic Auth): GET request to http://localhost:{PORT}/load-milestones/<task-id>")
    print(f"To load a single milestone (requires Basic Auth): GET request to http://localhost:{PORT}/load-milestone/<task-id>/<milestone-id>")
    print(f"To delete a task (and its milestones, requires Basic Auth): DELETE request to http://localhost:{PORT}/delete-task/<task-id>")
    print(f"To delete a milestone (requires Basic Auth): DELETE request to http://localhost:{PORT}/delete-milestone/<task-id>/<milestone-id>")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer is shutting down...")
        httpd.shutdown()
        print("Server has been shut down gracefully.")
