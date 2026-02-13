import subprocess
import tempfile
import os
import logging

logger = logging.getLogger(__name__)

class CodeRunner:
    """
    Executes code in a separate process.
    Supported languages: python, javascript, go
    """
    
    TIMEOUT = 5  # seconds

    @staticmethod
    def run_code(language: str, code: str) -> dict:
        """
        Runs the given code and returns the output or error.
        
        Returns:
            dict: {
                "output": str,
                "error": str,
                "exit_code": int
            }
        """
        language = language.lower()
        
        try:
            if language == "python":
                return CodeRunner._run_python(code)
            elif language == "javascript":
                return CodeRunner._run_javascript(code)
            elif language == "c":
                return CodeRunner._run_c(code)
            elif language == "cpp" or language == "c++":
                return CodeRunner._run_cpp(code)
            elif language == "java":
                return CodeRunner._run_java(code)
            else:
                return {
                    "output": "", 
                    "error": f"Unsupported language: {language}", 
                    "exit_code": -1
                }
        except Exception as e:
            logger.error(f"Error running code: {e}")
            return {
                "output": "", 
                "error": str(e), 
                "exit_code": -1
            }

    @staticmethod
    def _run_subprocess(command: list, cwd: str = None) -> dict:
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=CodeRunner.TIMEOUT,
                cwd=cwd
            )
            return {
                "output": result.stdout,
                "error": result.stderr,
                "exit_code": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {
                "output": "",
                "error": "Execution timed out (limit: 5s)",
                "exit_code": -1
            }
        except FileNotFoundError:
             return {
                "output": "",
                "error": f"Command not found: {command[0]}. Please ensure the compiler/interpreter is installed and in PATH.",
                "exit_code": -1
            }

    @staticmethod
    def _run_python(code: str) -> dict:
        # python -c "code"
        return CodeRunner._run_subprocess(["python", "-c", code])

    @staticmethod
    def _run_javascript(code: str) -> dict:
        # node -e "code"
        return CodeRunner._run_subprocess(["node", "-e", code])

    @staticmethod
    def _run_go(code: str) -> dict:
        # Go needs a file to run.
        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = os.path.join(temp_dir, "main.go")
            # Ensure package main exists
            if "package main" not in code:
                code = "package main\n" + code
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(code)
            
            return CodeRunner._run_subprocess(["go", "run", "main.go"], cwd=temp_dir)

    @staticmethod
    def _run_c(code: str) -> dict:
        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = os.path.join(temp_dir, "main.c")
            exe_path = os.path.join(temp_dir, "main.exe") if os.name == 'nt' else os.path.join(temp_dir, "main")
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(code)
            
            # Compile
            compile_result = CodeRunner._run_subprocess(["gcc", "main.c", "-o", "main"], cwd=temp_dir)
            if compile_result["exit_code"] != 0:
                return compile_result
            
            # Run
            return CodeRunner._run_subprocess([exe_path], cwd=temp_dir)

    @staticmethod
    def _run_cpp(code: str) -> dict:
        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = os.path.join(temp_dir, "main.cpp")
            exe_path = os.path.join(temp_dir, "main.exe") if os.name == 'nt' else os.path.join(temp_dir, "main")
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(code)
            
            # Compile
            compile_result = CodeRunner._run_subprocess(["g++", "main.cpp", "-o", "main"], cwd=temp_dir)
            if compile_result["exit_code"] != 0:
                return compile_result
            
            # Run
            return CodeRunner._run_subprocess([exe_path], cwd=temp_dir)

    @staticmethod
    def _run_java(code: str) -> dict:
        with tempfile.TemporaryDirectory() as temp_dir:
            # We assume the class name is 'Main' or try to extract it, 
            # but for simplicity let's require 'class Main' or inject it if missing?
            # A safer bet for snippets is to wrap it or force the user to write a class.
            # Let's enforce Main.java. User must provide `public class Main { public static void main(String[] args) { ... } }`
            
            file_path = os.path.join(temp_dir, "Main.java")
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(code)
            
            # Compile
            compile_result = CodeRunner._run_subprocess(["javac", "Main.java"], cwd=temp_dir)
            if compile_result["exit_code"] != 0:
                return compile_result
            
            # Run
            # java -cp . Main
            return CodeRunner._run_subprocess(["java", "-cp", ".", "Main"], cwd=temp_dir)
