from flask import Flask, request, jsonify
import random
import time

app = Flask(__name__)

TASA_FALLO = 0.7

@app.route("/")
def index():
    return {"servicio": "pagos", "endpoints": ["/health", "/procesar"]}

@app.route("/health")
def health():
    return {"status": "ok", "service": "pagos", "tasa_fallo_simulada": TASA_FALLO}

@app.route("/procesar", methods=["POST"])
def procesar_pago():
    inicio = time.time()
    data = request.get_json()
    monto = data.get("monto", 0)
    pedido_id = data.get("pedido_id")

    time.sleep(random.uniform(0.1, 0.5))

    if random.random() < TASA_FALLO:
        print(f"[PAGOS] pago FALLIDO pedido={pedido_id} monto={monto} - tiempo: {time.time() - inicio:.4f}s", flush=True)
        return {"aprobado": False, "motivo": "fallo interno del procesador de pagos"}, 500

    transaccion = f"TXN-{random.randint(10000, 99999)}"
    print(f"[PAGOS] pago APROBADO pedido={pedido_id} monto={monto} transaccion={transaccion} - tiempo: {time.time() - inicio:.4f}s", flush=True)
    return {"aprobado": True, "transaccion_id": transaccion}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
