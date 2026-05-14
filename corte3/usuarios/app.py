from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/usuarios")
def usuarios():
    return jsonify([
        {"id": 1, "nombre": "Ana"},
        {"id": 2, "nombre": "Luis"}
    ])

@app.route("/usuarios/<int:id>")
def usuario(id):
    data = [
        {"id": 1, "nombre": "Ana"},
        {"id": 2, "nombre": "Luis"}
    ]
    user = next((u for u in data if u["id"] == id), None)

    if user:
        return jsonify(user)
    return jsonify({"error": "No encontrado"}), 404

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)