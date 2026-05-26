from flask import Flask, request, jsonify
app= Flask(__name__)

@app.route("/inventario")
def inventario():
    print("[INVENTARIO], Extrayendo información de inventario.",flush=True);
    return jsonify([
        {"inventario_id":1, "cod": "01", "descripcion":"Televisor"},
        {"inventario_id":2, "cod": "02", "descripcion":"Nevera"},
        {"inventario_id":3, "cod": "03", "descripcion":"Equipo de sonido"}
    ])

@app.route("/health")
def health():
    return{
        "status" : "ok",
        "service" : "Inventario"
    }


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)