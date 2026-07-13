"""
Authentication API for HeatMapX.

Exposes a Flask Blueprint (mounted at /api/auth in app.py) with:
    POST /api/auth/register  - create an account
    POST /api/auth/login     - start a session
    POST /api/auth/logout    - end the current session
    GET  /api/auth/me        - return the current logged-in user (or null)

Sessions are managed by Flask-Login using a secure, HTTP-only session
cookie. Passwords are never stored or logged in plaintext - see
User.set_password / User.check_password in models.py, which use
Werkzeug's salted PBKDF2 password hashing.
"""
import re

from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user

from models import db, User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LENGTH = 6


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or not email or not password:
        return jsonify({"error": "Name, email and password are all required."}), 400

    if not EMAIL_RE.match(email):
        return jsonify({"error": "Please provide a valid email address."}), 400

    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({
            "error": f"Password must be at least {MIN_PASSWORD_LENGTH} characters long."
        }), 400

    if User.query.filter_by(email=email).first() is not None:
        return jsonify({"error": "An account with this email already exists."}), 409

    user = User(name=name, email=email)
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    # Automatically sign the user in after registering.
    login_user(user, remember=True)

    return jsonify({
        "message": "Account created successfully.",
        "user": user.to_dict(),
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    user = User.query.filter_by(email=email).first()

    # Deliberately vague error so we don't reveal whether the email exists.
    if user is None or not user.check_password(password):
        return jsonify({"error": "Invalid email or password."}), 401

    login_user(user, remember=True)

    return jsonify({
        "message": "Logged in successfully.",
        "user": user.to_dict(),
    }), 200


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return jsonify({"message": "Logged out successfully."}), 200


@auth_bp.route("/me", methods=["GET"])
def me():
    if current_user.is_authenticated:
        return jsonify({"user": current_user.to_dict()}), 200
    return jsonify({"user": None}), 200
