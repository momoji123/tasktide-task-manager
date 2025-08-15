import http.server
import socketserver
import os
import json
from urllib.parse import urlparse

# Define the port number the server will listen on.
PORT = 12345

# Define the directory to store the JSON data files.
# This directory will be created if it doesn't exist.
DATA_DIR = "data"

# Ensure the data directory exists
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)
    print(f"Created data directory: {DATA_DIR}")

# Custom Request Handler to manage PUT and GET requests for task data
# and also serve static files.
# We inherit from SimpleHTTPRequestHandler to get static file serving capabilities.
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

    # Handles PUT requests for saving task data
    def do_PUT(self):
        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        # Check if the request path matches the expected format: /save-task/<task-id>
        if len(path_segments) == 2 and path_segments[0] == "save-task":
            task_id = path_segments[1]
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)

            try:
                # Attempt to decode the received data as JSON
                task_data = json.loads(post_data.decode('utf-8'))
                file_path = os.path.join(DATA_DIR, f"{task_id}.json")

                # Save the JSON data to a file
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(task_data, f, indent=4)

                print(f"Saved task '{task_id}' to {file_path}")
                self._send_response(200, "application/json", json.dumps({"message": f"Task '{task_id}' saved successfully."}))

            except json.JSONDecodeError:
                # Handle cases where the received data is not valid JSON
                print(f"Error: Invalid JSON received for task '{task_id}'")
                self._send_response(400, "application/json", json.dumps({"error": "Invalid JSON format."}))
            except Exception as e:
                # Handle other potential errors during file writing
                print(f"Error saving task '{task_id}': {e}")
                self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}))
        else:
            # Respond with 404 Not Found if the path does not match
            self._send_response(404, "application/json", json.dumps({"error": "Endpoint not found. Use /save-task/<task-id>"}))

    # Handles GET requests for loading task data or serving static files
    def do_GET(self):
        parsed_path = urlparse(self.path)
        path_segments = parsed_path.path.strip('/').split('/')

        # Check if the request path matches the expected format: /load-task/<task-id>
        if len(path_segments) == 2 and path_segments[0] == "load-task":
            task_id = path_segments[1]
            file_path = os.path.join(DATA_DIR, f"{task_id}.json")

            if os.path.exists(file_path):
                try:
                    # Load the JSON data from the file
                    with open(file_path, 'r', encoding='utf-8') as f:
                        task_data = json.load(f)
                    print(f"Loaded task '{task_id}' from {file_path}")
                    # Send the loaded JSON data back to the client
                    self._send_response(200, "application/json", json.dumps(task_data, indent=4).encode('utf-8'))
                except json.JSONDecodeError:
                    # Handle cases where the file content is not valid JSON
                    print(f"Error: File '{file_path}' contains invalid JSON.")
                    self._send_response(500, "application/json", json.dumps({"error": "Stored file is corrupted (invalid JSON)."}).encode('utf-8'))
                except Exception as e:
                    # Handle other potential errors during file reading
                    print(f"Error loading task '{task_id}': {e}")
                    self._send_response(500, "application/json", json.dumps({"error": f"Server error: {e}"}).encode('utf-8'))
            else:
                # Respond with 404 Not Found if the file does not exist
                print(f"Task '{task_id}' not found at {file_path}")
                self._send_response(404, "application/json", json.dumps({"error": f"Task '{task_id}' not found."}).encode('utf-8'))
        else:
            # If the path is not for /load-task, let the base class (SimpleHTTPRequestHandler)
            # handle it, which will serve static files from the current directory.
            super().do_GET()


# Create the server using ThreadingTCPServer for concurrent requests.
with socketserver.ThreadingTCPServer(("", PORT), SimpleTaskServerHandler) as httpd:
    # Set the current working directory to "." so SimpleHTTPRequestHandler serves from here.
    # This also means your index.html should be in the same directory as the script,
    # or you can change os.chdir() to a specific web directory.
    os.chdir(".") # Ensure the server looks for files in the current directory.

    print(f"Serving HTTP on port {PORT}")
    print(f"Access static files at: http://localhost:{PORT}/")
    print(f"Data will be stored in: {os.path.abspath(DATA_DIR)}")
    print(f"To save a task: PUT request to http://localhost:{PORT}/save-task/<task-id> with JSON body")
    print(f"To load a task: GET request to http://localhost:{PORT}/load-task/<task-id>")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer is shutting down...")
        httpd.shutdown()
        print("Server has been shut down gracefully.")
