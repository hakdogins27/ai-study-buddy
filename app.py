from flask import Flask, request, jsonify, render_template, g
from flask_cors import CORS
from flask_talisman import Talisman
import httpx
import os
import json
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, auth, firestore
from functools import wraps
import math
import re
import random
import time
from datetime import datetime

# --- Initialization ---
load_dotenv()
API_KEY = os.getenv("TOGETHER_API_KEY")

# NEW: Smartly initialize Firebase for Vercel (production) and local development
# This block replaces the old initialization logic.
if os.getenv('VERCEL_ENV') == 'production':
    # In Vercel, read the JSON content directly from the environment variable
    print("Vercel environment detected. Initializing Firebase from environment variable.")
    service_account_json_str = os.getenv('FIREBASE_SERVICE_ACCOUNT_KEY')
    
    # --- THIS IS THE NEW DEBUG LINE ---
    print(f"RAW ENV VAR VALUE RECEIVED: '{service_account_json_str}'")
    
    if not service_account_json_str:
        print("FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_KEY environment variable was empty.")
    else:
        try:
            service_account_info = json.loads(service_account_json_str)
            cred = credentials.Certificate(service_account_info)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            print("Firebase Admin SDK initialized successfully for Vercel.")
        except Exception as e:
            print(f"Error initializing Firebase from environment variable: {e}")
else:
    # Locally, read the JSON from the file path defined in your .env
    print("Local environment detected. Initializing Firebase from file path.")
    SERVICE_ACCOUNT_KEY_PATH = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY_PATH") 
    if not SERVICE_ACCOUNT_KEY_PATH or not os.path.exists(SERVICE_ACCOUNT_KEY_PATH):
        print(f"FATAL ERROR: Service account key file not found at path: '{SERVICE_ACCOUNT_KEY_PATH}'")
    else:
        try:
            cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            print("Firebase Admin SDK initialized successfully for local development.")
        except Exception as e:
            print(f"Error initializing Firebase from file: {e}")

app = Flask(__name__)
CORS(app)
BASE_URL = "https://api.together.xyz/v1/chat/completions"
MODEL = "mistralai/Mixtral-8x7B-Instruct-v0.1"
db = firestore.client()

csp = {
    'default-src': "'self'",
    'script-src': ["'self'", "https://www.gstatic.com/firebasejs/", "'unsafe-eval'"],
    'connect-src': [
        "'self'", 
        "https://*.firebaseio.com", 
        "https://www.googleapis.com", 
        "https://securetoken.googleapis.com", 
        "https://firestore.googleapis.com",
        "https://api.together.xyz"
    ],
    'style-src': "'self' 'unsafe-inline'",
    'img-src': ["'self'", "data:", "https://www.google.com"],
    'frame-src': ["'self'", "https://*.firebaseapp.com", "https://accounts.google.com"]
}
Talisman(app, content_security_policy=csp, force_https=False)

SYSTEM_PROMPT_TUTOR = (
    "You are Onyx, a friendly and knowledgeable AI tutor helping a student understand the topic of **{topic}**. "
    "You act and speak like a real teacher—clear, warm, supportive, and focused on deep understanding.\n\n"

    "**INSTRUCTION FLOW:**\n"
    "1. On your **first message**, you MUST:\n"
    "   - Briefly explain the topic in simple and clear language.\n"
    "   - Give a short example that helps illustrate the concept.\n"
    "   - THEN ask a simple, related question to get the conversation started.\n"
    "   - DO NOT skip the explanation and example — these come BEFORE the question.\n\n"

    "2. On following turns:\n"
    "   - When the student answers a question, evaluate their response.\n"
    "   - If the answer is ✅ correct:\n"
    "     - Praise briefly (e.g., '✅ Great job!').\n"
    "     - Then explain the logic behind the correct answer (briefly).\n"
    "     - Then ask the next, slightly more challenging question.\n"
    "   - If the answer is ❌ incorrect:\n"
    "     - Gently explain why it's wrong.\n"
    "     - Provide the correct answer with a simple explanation.\n"
    "     - Ask a new but related question to reinforce the concept.\n\n"

    "**RULES:**\n"
    "- NEVER answer your own question.\n"
    "- DO NOT skip explanations — every new concept or correction must include one.\n"
    "- Keep responses friendly, conversational, and focused only on teaching — no meta talk or AI disclaimers.\n"
    "- Stay in character as a human-like tutor who genuinely wants to help the student learn through interaction.\n\n"

    "**GOAL:** Build knowledge step-by-step. Be encouraging. Teach first, then quiz. Interact like a caring, clear, and capable tutor."
)

SYSTEM_PROMPT_QUIZ_DYNAMIC = (
    "You are a highly precise quiz creator. Your task is to generate a quiz derived *exclusively* from the provided conversation log. "
    "The information needed to answer every question **must be explicitly present** in the 'assistant' responses within the log. Do not use outside knowledge. "
    "Crucially, ensure that the facts tested in the `multiple_choice` section are different from the facts tested in the `enumeration` section to avoid redundancy. "
    "**VERY IMPORTANT**: For any questions involving math, dates, or other objective facts, you must first verify the correct answer internally before creating the question. The final question must be factually correct. "
    "You MUST respond ONLY with a valid JSON object. This object must contain two keys: `multiple_choice` and `enumeration`. "
    "1. The `multiple_choice` key must contain an array of exactly {num_questions} multiple-choice question objects. Each object must have these keys: "
    "'question' (string), 'choices' (an array of 4 strings), and 'correct' (a string containing ONLY the single, uppercase letter of the correct choice, e.g., 'A', 'B', 'C', or 'D'). "
    "**DO NOT** put the answer text in the 'correct' field; it **MUST** be the letter. "
    "2. The `enumeration` key must contain an array of exactly {num_questions} fill-in-the-blank style question objects. Each object must have these keys: "
    "'question' (string, e.g., 'The powerhouse of the cell is the ____.') and 'answer' (string, a concise, one or two-word answer, e.g., 'Mitochondrion'). "
    "Do not include any text before or after the JSON object."
)

def token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(' ')[1]
        if not token:
            return jsonify({'error': 'Authorization token is missing!'}), 401
        try:
            decoded_token = auth.verify_id_token(token, clock_skew_seconds=60)
            g.user = decoded_token
        except Exception as e:
            print(f"TOKEN VERIFICATION FAILED: {e}")
            return jsonify({'error': 'Invalid or expired token!', 'details': str(e)}), 403
        return f(*args, **kwargs)
    return decorated_function

def match_patterns(patterns, question, user_answer):
    try:
        user_answer = int(re.sub(r"[^0-9\-]", "", str(user_answer)))
    except:
        return None, None

    for pattern, operation in patterns:
        match = re.search(pattern, question, re.IGNORECASE)
        if match:
            try:
                groups = match.groups()
                nums = [int(g) for g in groups if g.lstrip('-').isdigit()]
                if len(nums) >= operation.__code__.co_argcount:
                    correct = operation(*nums)
                    return user_answer == correct, correct
            except Exception as e:
                print(f"[ERROR] Failed to compute answer: {e}")
                continue
    return None, None


def validate_addition(question, user_answer):
    patterns = [
        (r"(\d+)\s*\+\s*(\d+)", lambda a, b: a + b),
        (r"have (\d+).*?(add|bake|make|get|receive).*?(\d+)", lambda a, b: a + b),
    ]
    return match_patterns(patterns, question, user_answer)


def validate_subtraction(question, user_answer):
    patterns = [
        (r"(\d+)\s*\-\s*(\d+)", lambda a, b: a - b),
        (r"if .*?have (\d+).*?(eat|give).*?(\d+)", lambda a, b: a - b),
    ]
    return match_patterns(patterns, question, user_answer)


def validate_multiplication(question, user_answer):
    patterns = [
        (r"(\d+)\s*\*\s*(\d+)", lambda a, b: a * b),
        (r"(\d+) times (\d+)", lambda a, b: a * b),
    ]
    return match_patterns(patterns, question, user_answer)


def validate_division(question, user_answer):
    patterns = [
        (r"(\d+)\s*/\s*(\d+)", lambda a, b: a // b if b != 0 else None),
        (r"(\d+) divided by (\d+)", lambda a, b: a // b if b != 0 else None),
    ]
    return match_patterns(patterns, question, user_answer)


def validate_arithmetic(question, user_answer):
    for validator in [
        validate_addition,
        validate_subtraction,
        validate_multiplication,
        validate_division
    ]:
        is_correct, correct = validator(question, user_answer)
        if is_correct is not None:
            return is_correct, correct
    return None, None



def generate_next_addition_question(current_max):
    num1 = random.randint(1, current_max + 5)
    num2 = random.randint(1, current_max + 5)
    return f"What is {num1} + {num2}?"

def truncate_if_ai_answers_own_question(ai_message, latest_question):
    if latest_question in ai_message:
        index = ai_message.find(latest_question) + len(latest_question)
        return ai_message[:index].strip() + " 🤖 Now it's your turn!"
    return ai_message
    
@app.route("/")
def index(): return render_template("index.html")
@app.route("/login")
def login(): return render_template("login.html")
@app.route("/register")
def register(): return render_template("register.html")
@app.route("/home")
def home(): return render_template("home.html")
@app.route("/dashboard")
def dashboard(): return render_template("dashboard.html")
@app.route("/learn")
def learn(): return render_template("learn.html")
@app.route("/quiz")
def quiz(): return render_template("quiz.html")
@app.route("/review/<quiz_id>")
def review(quiz_id): return render_template("review.html")

@app.route("/save-lesson", methods=["POST"])
@token_required
def save_lesson():
    try:
        uid = g.user['uid']
        data = request.get_json()
        topic = data.get('topic')
        conversation = data.get('conversation')

        if not topic or not conversation:
            return jsonify({'error': 'Missing topic or conversation data'}), 400

        lessons_ref = db.collection('users').document(uid).collection('lessons')

        lessons_ref.add({
            'topic': topic,
            'conversation': conversation,
            'date': firestore.SERVER_TIMESTAMP,
            'userId': uid
        })
        return jsonify({'success': True}), 201

    except Exception as e:
        print(f"!!! CRITICAL ERROR in /save-lesson: {e} !!!")
        return jsonify({"error": "Failed to save lesson"}), 500


@app.route("/ask-ai", methods=["POST"])
@token_required
def ask_ai():
    try:
        data = request.get_json()
        messages_from_client = data.get("messages", [])
        topic = data.get("topic")

        if not messages_from_client or not topic:
            return jsonify({"error": "Missing messages or topic"}), 400

        system_prompt_tutor = SYSTEM_PROMPT_TUTOR.replace("{topic}", topic)
        messages_for_api = [{"role": "system", "content": system_prompt_tutor}] + messages_from_client
        
        headers = {"Authorization": f"Bearer {API_KEY}"}
        body = {"model": MODEL, "messages": messages_for_api, "max_tokens": 300}

        response = httpx.post(BASE_URL, headers=headers, json=body, timeout=60.0)
        response.raise_for_status()
        
        ai_message = response.json()["choices"][0]["message"]["content"]
        
        # This function doesn't exist in your provided code, so I've commented it out.
        # If you want to prevent the AI from answering its own questions, you can add it back.
        # ai_message = clean_ai_self_answer(ai_message)

        return jsonify({"response": ai_message})

    except httpx.HTTPStatusError as e:
        return jsonify({"error": "The AI service is temporarily unavailable."}), 503
    except Exception as e:
        print(f"!!! CRITICAL ERROR in /ask-ai: {e} !!!")
        return jsonify({"error": "An unexpected error occurred."}), 500


@app.route("/generate-quiz", methods=["POST"])
@token_required
def generate_quiz():
    try:
        data = request.get_json()
        topic = data.get("topic")
        conversation = data.get("conversation")
        conversation_length = data.get("conversationLength")

        if not all([conversation, topic, conversation_length]):
            return jsonify({"error": "Missing topic, conversation, or conversation length."}), 400
        
        num_questions_per_type = max(2, min(5, math.floor(conversation_length / 4)))
        final_quiz_prompt = SYSTEM_PROMPT_QUIZ_DYNAMIC.format(num_questions=num_questions_per_type)
        
        conversation_log = "\n".join([f"{msg['role']}: {msg['content']}" for msg in conversation])
        user_content = f"Generate a quiz based on this conversation about '{topic}':\n\n--- CONVERSATION LOG ---\n{conversation_log}\n--- END LOG ---"

        messages_for_api = [{"role": "system", "content": final_quiz_prompt}, {"role": "user", "content": user_content}]
        headers = {"Authorization": f"Bearer {API_KEY}"}
        body = {"model": MODEL, "messages": messages_for_api, "response_format": {"type": "json_object"}, "max_tokens": 3000}
        
        response = httpx.post(BASE_URL, headers=headers, json=body, timeout=150.0)
        response.raise_for_status()
        
        response_content = response.json()["choices"][0]["message"]["content"]
        
        try:
            quiz_data = json.loads(response_content)
            if 'multiple_choice' not in quiz_data or 'enumeration' not in quiz_data:
                raise ValueError("AI response missing required quiz keys.")
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error: AI did not return valid JSON or structure. Error: {e}. Response: {response_content}")
            return jsonify({"error": "Failed to parse quiz from AI response."}), 500

        return jsonify({"quiz_content": quiz_data})

    except Exception as e:
        print(f"Error in /generate-quiz route: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)

    # Triggering a fresh Vercel Deployment from vscodes
    