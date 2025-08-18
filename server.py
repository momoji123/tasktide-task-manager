import http.server
import socketserver
import json
import sqlite3
import os
from urllib.parse import urlparse

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
        self.end_headers()
        if isinstance(body, str):
            self.wfile.write(body.encode("utf-8"))
        else: # Assuming bytes or JSON
            self.wfile.write(body)

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

    def do_PUT(self):
        """Handles PUT requests for saving task or milestone data."""
        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        conn = None
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(post_data)

            # Save Task: /save-task/<username>/<task-id>
            if len(path_segments) == 3 and path_segments[0] == "save-task":
                username = path_segments[1]
                task_id = path_segments[2]

                if not self._is_safe_path(username) or not self._is_safe_path(task_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid username or task ID. Input segments cannot contain '..', '.' or path separators."}))
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

            # Save Milestone: /save-milestone/<username>/<task-id>/<milestone-id>
            elif len(path_segments) == 4 and path_segments[0] == "save-milestone":
                username = path_segments[1] # Not directly used in DB for milestone, but good for validation/logging
                task_id = path_segments[2]
                milestone_id = path_segments[3]

                if not self._is_safe_path(username) or not self._is_safe_path(task_id) or not self._is_safe_path(milestone_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid username, task ID, or milestone ID. Input segments cannot contain '..', '.' or path separators."}))
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
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()

            # Load Task: /load-task/<username>/<task-id>
            if len(path_segments) == 3 and path_segments[0] == "load-task":
                username = path_segments[1]
                task_id = path_segments[2]

                if not self._is_safe_path(username) or not self._is_safe_path(task_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid username or task ID. Input segments cannot contain '..', '.' or path separators."}).encode('utf-8'))
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

            # Load Milestones for a Task: /load-milestones/<username>/<task-id>
            elif len(path_segments) == 3 and path_segments[0] == "load-milestones":
                username = path_segments[1] # Not directly used for query, but important for client logic
                task_id = path_segments[2]

                if not self._is_safe_path(username) or not self._is_safe_path(task_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid username or task ID. Input segments cannot contain '..', '.' or path separators."}).encode('utf-8'))
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

            # Load Single Milestone: /load-milestone/<username>/<task-id>/<milestone-id>
            elif len(path_segments) == 4 and path_segments[0] == "load-milestone":
                username = path_segments[1] # Not directly used for query, but important for client logic
                task_id = path_segments[2]
                milestone_id = path_segments[3]

                if not self._is_safe_path(username) or not self._is_safe_path(task_id) or not self._is_safe_path(milestone_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid username, task ID, or milestone ID. Input segments cannot contain '..', '.' or path separators."}).encode('utf-8'))
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
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()

            # Delete Task: /delete-task/<username>/<task-id>
            if len(path_segments) == 3 and path_segments[0] == "delete-task":
                username = path_segments[1]
                task_id = path_segments[2]

                if not self._is_safe_path(username) or not self._is_safe_path(task_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid username or task ID. Input segments cannot contain '..', '.' or path separators."}))
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

            # Delete Milestone: /delete-milestone/<username>/<task-id>/<milestone-id>
            elif len(path_segments) == 4 and path_segments[0] == "delete-milestone":
                username = path_segments[1] # For ownership verification
                task_id = path_segments[2]
                milestone_id = path_segments[3]

                if not self._is_safe_path(username) or not self._is_safe_path(task_id) or not self._is_safe_path(milestone_id):
                    self._send_response(400, "application/json", json.dumps({"error": "Invalid username, task ID, or milestone ID. Input segments cannot contain '..', '.' or path separators."}))
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

        except sqlite3.Error as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Database error: {e}"}))
        except Exception as e:
            self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}))
        finally:
            if conn:
                conn.close()

# Initialize the database before starting the server
_init_db()

# Create the server using ThreadingTCPServer for concurrent requests.
with socketserver.ThreadingTCPServer(("localhost", PORT), SimpleTaskServerHandler) as httpd:
    os.chdir(".")
    print(f"Serving HTTP on port {PORT}")
    print(f"Access static files at: http://localhost:{PORT}/")
    print(f"Data will be stored in SQLite database: {os.path.abspath(DB_FILE)}")
    print(f"To save a task: PUT request to http://localhost:{PORT}/save-task/<username>/<task-id> with JSON body")
    print(f"To save a milestone: PUT request to http://localhost:{PORT}/save-milestone/<username>/<task-id>/<milestone-id> with JSON body")
    print(f"To load a task: GET request to http://localhost:{PORT}/load-task/<username>/<task-id>")
    print(f"To load milestones: GET request to http://localhost:{PORT}/load-milestones/<username>/<task-id>")
    print(f"To load a single milestone: GET request to http://localhost:{PORT}/load-milestone/<username>/<task-id>/<milestone-id>")
    print(f"To delete a task (and its milestones): DELETE request to http://localhost:{PORT}/delete-task/<username>/<task-id>")
    print(f"To delete a milestone: DELETE request to http://localhost:{PORT}/delete-milestone/<username>/<task-id>/<milestone-id>")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer is shutting down...")
        httpd.shutdown()
        print("Server has been shut down gracefully.")
