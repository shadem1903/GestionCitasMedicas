from flask import Flask, request, jsonify
app= Flask(__name__)

@app.route("/usuarios")
def usuarios():
    return jsonify([
        {"id":1, "nombre": "Mariani"},
        {"id":2, "nombre":"Carlos"}
    ])

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)