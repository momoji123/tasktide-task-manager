import http.server
import socketserver
import os
import json
import shutil # Import shutil for directory removal
from urllib.parse import urlparse

# Define the port number the server will listen on.
PORT = 12345

# Define the base directory to store the JSON data files.
DATA_DIR = "data"

# Ensure the base data directory exists
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)
    print(f"Created base data directory: {DATA_DIR}")

# Custom Request Handler to manage PUT, GET, and DELETE requests
class SimpleTaskServerHandler(http.server.SimpleHTTPRequestHandler):

    # Helper function to send an HTTP response
    def _send_response(self, status_code, content_type="text/plain", body=""):
        self.send_response(status_code)
        self.send_header("Content-type", content_type)
        self.end_headers()
        if isinstance(body, str):
            self.wfile.write(body.encode("utf-8"))
        else: # Assuming bytes or JSON
            self.wfile.write(body)

    # Handles PUT requests for saving task or milestone data
    def do_PUT(self):
        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        # Save Task: /save-task/<username>/<task-id>
        # Path segments: ['save-task', <username>, <task-id>]
        if len(path_segments) == 3 and path_segments[0] == "save-task":
            username = path_segments[1]
            task_id = path_segments[2]
            
            # Construct task-specific directory: data/username/task_id
            task_data_dir = os.path.join(DATA_DIR, username, task_id)
            if not os.path.exists(task_data_dir):
                os.makedirs(task_data_dir)

            file_path = os.path.join(task_data_dir, f"{task_id}.json")
            
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)

            try:
                task_data = json.loads(post_data.decode('utf-8'))
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(task_data, f, indent=4)
                self._send_response(200, "application/json", json.dumps({"message": f"Task '{task_id}' for user '{username}' saved successfully."}))
            except json.JSONDecodeError:
                self._send_response(400, "application/json", json.dumps({"error": "Invalid JSON format."}))
            except Exception as e:
                self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}))
        
        # Save Milestone: /save-milestone/<username>/<task-id>/<milestone-id>
        # Path segments: ['save-milestone', <username>, <task-id>, <milestone-id>]
        elif len(path_segments) == 4 and path_segments[0] == "save-milestone":
            username = path_segments[1]
            task_id = path_segments[2]
            milestone_id = path_segments[3]
            
            # Construct task-specific directory for milestones: data/username/task_id
            task_milestone_dir = os.path.join(DATA_DIR, username, task_id)
            if not os.path.exists(task_milestone_dir):
                os.makedirs(task_milestone_dir)

            file_path = os.path.join(task_milestone_dir, f"{milestone_id}.json")

            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)

            try:
                milestone_data = json.loads(post_data.decode('utf-8'))
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(milestone_data, f, indent=4)
                self._send_response(200, "application/json", json.dumps({"message": f"Milestone '{milestone_id}' for task '{task_id}' by user '{username}' saved successfully."}))
            except json.JSONDecodeError:
                self._send_response(400, "application/json", json.dumps({"error": "Invalid JSON format."}))
            except Exception as e:
                self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}))
        else:
            self._send_response(404, "application/json", json.dumps({"error": "Endpoint not found."}))

    # Handles GET requests for loading task data or serving static files
    def do_GET(self):
        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        # Load Task: /load-task/<username>/<task-id>
        # Path segments: ['load-task', <username>, <task-id>]
        if len(path_segments) == 3 and path_segments[0] == "load-task":
            username = path_segments[1]
            task_id = path_segments[2]
            task_file_path = os.path.join(DATA_DIR, username, task_id, f"{task_id}.json")

            if os.path.exists(task_file_path):
                try:
                    with open(task_file_path, 'r', encoding='utf-8') as f:
                        task_data = json.load(f)
                    self._send_response(200, "application/json", json.dumps(task_data, indent=4).encode('utf-8'))
                except json.JSONDecodeError:
                    self._send_response(500, "application/json", json.dumps({"error": "Stored file is corrupted (invalid JSON)."}).encode('utf-8'))
                except Exception as e:
                    self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}).encode('utf-8'))
            else:
                self._send_response(404, "application/json", json.dumps({"error": f"Task '{task_id}' for user '{username}' not found."}).encode('utf-8'))
        
        # Load Milestones: /load-milestones/<username>/<task-id>
        # Path segments: ['load-milestones', <username>, <task-id>]
        elif len(path_segments) == 3 and path_segments[0] == "load-milestones":
            username = path_segments[1]
            task_id = path_segments[2]
            task_milestone_dir = os.path.join(DATA_DIR, username, task_id)
            milestones = []

            if os.path.exists(task_milestone_dir) and os.path.isdir(task_milestone_dir):
                for filename in os.listdir(task_milestone_dir):
                    # Only load milestone JSONs, not the task JSON itself
                    if filename.endswith(".json") and filename != f"{task_id}.json":
                        milestone_file_path = os.path.join(task_milestone_dir, filename)
                        try:
                            with open(milestone_file_path, 'r', encoding='utf-8') as f:
                                milestone_data = json.load(f)
                                milestones.append(milestone_data)
                        except json.JSONDecodeError:
                            print(f"Error: File '{milestone_file_path}' contains invalid JSON. Skipping.")
                        except Exception as e:
                            print(f"Error loading milestone from '{milestone_file_path}': {e}. Skipping.")
                self._send_response(200, "application/json", json.dumps(milestones, indent=4).encode('utf-8'))
            else:
                # Return empty array if the task directory or milestones directory doesn't exist
                self._send_response(200, "application/json", json.dumps([]).encode('utf-8')) 

        else:
            # For all other GET requests, serve static files as before
            super().do_GET()

    # Handles DELETE requests for deleting task folders or individual milestone files
    def do_DELETE(self):
        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        # Delete Task: /delete-task/<username>/<task-id> (deletes the entire task folder)
        # Path segments: ['delete-task', <username>, <task-id>]
        if len(path_segments) == 3 and path_segments[0] == "delete-task":
            username = path_segments[1]
            task_id = path_segments[2]
            # Construct the path to the user's task directory
            task_dir_path = os.path.join(DATA_DIR, username, task_id)

            if os.path.exists(task_dir_path) and os.path.isdir(task_dir_path):
                try:
                    shutil.rmtree(task_dir_path)
                    self._send_response(200, "application/json", json.dumps({"message": f"Task folder '{task_id}' for user '{username}' deleted successfully."}))
                except Exception as e:
                    self._send_response(500, "application/json", json.dumps({"error": f"Server error deleting task folder: {e}"}))
            else:
                self._send_response(404, "application/json", json.dumps({"error": f"Task folder '{task_id}' for user '{username}' not found."}))
        
        # Delete Milestone: /delete-milestone/<username>/<task-id>/<milestone-id>
        # Path segments: ['delete-milestone', <username>, <task-id>, <milestone-id>]
        elif len(path_segments) == 4 and path_segments[0] == "delete-milestone":
            username = path_segments[1]
            task_id = path_segments[2]
            milestone_id = path_segments[3]
            # Construct the path to the specific milestone file
            milestone_file_path = os.path.join(DATA_DIR, username, task_id, f"{milestone_id}.json")

            if os.path.exists(milestone_file_path):
                try:
                    os.remove(milestone_file_path)
                    self._send_response(200, "application/json", json.dumps({"message": f"Milestone '{milestone_id}' for task '{task_id}' by user '{username}' deleted successfully."}))
                except Exception as e:
                    self._send_response(500, "application/json", json.dumps({"error": f"Server error deleting milestone: {e}"}))
            else:
                self._send_response(404, "application/json", json.dumps({"error": f"Milestone '{milestone_id}' for task '{task_id}' by user '{username}' not found."}))
        else:
            self._send_response(404, "application/json", json.dumps({"error": "Endpoint not found."}))


# Create the server using ThreadingTCPServer for concurrent requests.
with socketserver.ThreadingTCPServer(("", PORT), SimpleTaskServerHandler) as httpd:
    os.chdir(".") # Ensure the server looks for files in the current directory.

    print(f"Serving HTTP on port {PORT}")
    print(f"Access static files at: http://localhost:{PORT}/")
    print(f"Data will be stored in: {os.path.abspath(DATA_DIR)}")
    print(f"To save a task: PUT request to http://localhost:{PORT}/save-task/<username>/<task-id> with JSON body")
    print(f"To save a milestone: PUT request to http://localhost:{PORT}/save-milestone/<username>/<task-id>/<milestone-id> with JSON body")
    print(f"To load a task: GET request to http://localhost:{PORT}/load-task/<username>/<task-id>")
    print(f"To load milestones: GET request to http://localhost:{PORT}/load-milestones/<username>/<task-id>")
    print(f"To delete a task (and its folder): DELETE request to http://localhost:{PORT}/delete-task/<username>/<task-id>")
    print(f"To delete a milestone: DELETE request to http://localhost:{PORT}/delete-milestone/<username>/<task-id>/<milestone-id>")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer is shutting down...")
        httpd.shutdown()
        print("Server has been shut down gracefully.")
