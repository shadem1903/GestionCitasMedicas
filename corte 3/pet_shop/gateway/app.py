from dataclasses import dataclass, field
from time import monotonic
from typing import Optional

from flask import Flask, jsonify, request
import requests

app = Flask(__name__)

FAILURE_THRESHOLD = 3
RECOVERY_TIMEOUT_SECONDS = 10
REQUEST_TIMEOUT_SECONDS = 2


@dataclass
class CircuitBreaker:
    service_name: str
    failure_threshold: int = FAILURE_THRESHOLD
    recovery_timeout: int = RECOVERY_TIMEOUT_SECONDS
    failures: int = 0
    state: str = "closed"
    opened_at: Optional[float] = None
    last_error: Optional[str] = None
    _half_open_probe_running: bool = field(default=False, init=False)

    def allow_request(self) -> bool:
        if self.state == "closed":
            return True

        if self.state == "open":
            elapsed = monotonic() - (self.opened_at or 0)
            if elapsed >= self.recovery_timeout:
                self.state = "half-open"
                self._half_open_probe_running = False
                print(f"[{self.service_name}] circuito en half-open", flush=True)
                return True
            return False

        if self.state == "half-open" and not self._half_open_probe_running:
            self._half_open_probe_running = True
            return True

        return False

    def register_success(self) -> None:
        previous_state = self.state
        self.failures = 0
        self.state = "closed"
        self.opened_at = None
        self.last_error = None
        self._half_open_probe_running = False
        if previous_state != "closed":
            print(f"[{self.service_name}] circuito cerrado", flush=True)

    def register_failure(self, error: Exception) -> None:
        self.failures += 1
        self.last_error = str(error)
        self._half_open_probe_running = False

        if self.state == "half-open" or self.failures >= self.failure_threshold:
            self.state = "open"
            self.opened_at = monotonic()
            print(
                f"[{self.service_name}] circuito abierto por fallo: {self.last_error}",
                flush=True,
            )
            return

        print(
            f"[{self.service_name}] fallo {self.failures}/{self.failure_threshold}: {self.last_error}",
            flush=True,
        )

    def response_when_open(self):
        return (
            jsonify(
                {
                    "error": f"Servicio {self.service_name} temporalmente bloqueado",
                    "estado_circuito": self.state,
                    "reintento_en_segundos": self.seconds_until_retry(),
                }
            ),
            503,
        )

    def seconds_until_retry(self) -> int:
        if self.state != "open" or self.opened_at is None:
            return 0

        elapsed = monotonic() - self.opened_at
        return max(0, int(self.recovery_timeout - elapsed))

    def snapshot(self) -> dict:
        return {
            "servicio": self.service_name,
            "estado": self.state,
            "fallos": self.failures,
            "umbral_fallos": self.failure_threshold,
            "reintento_en_segundos": self.seconds_until_retry(),
            "ultimo_error": self.last_error,
        }


circuits = {
    "mascotas": CircuitBreaker("mascotas"),
    "usuarios": CircuitBreaker("usuarios"),
}

SERVICES = {
    "mascotas": "http://backend:5000",
    "usuarios": "http://usuarios:5000",
}


def call_service(service_name: str, path: str, method: str = "GET", **kwargs):
    circuit = circuits[service_name]
    if not circuit.allow_request():
        return None, circuit.response_when_open()

    try:
        response = requests.request(
            method,
            f"{SERVICES[service_name]}{path}",
            timeout=REQUEST_TIMEOUT_SECONDS,
            **kwargs,
        )
        response.raise_for_status()
        circuit.register_success()
        return response.json(), None
    except requests.RequestException as error:
        circuit.register_failure(error)
        return None, (
            jsonify(
                {
                    "error": f"Servicio {service_name} no disponible",
                    "estado_circuito": circuit.state,
                    "fallos": circuit.failures,
                }
            ),
            503,
        )


@app.route("/usuarios")
def usuarios():
    data, error_response = call_service("usuarios", "/usuarios")
    if error_response:
        return error_response

    return jsonify(data)


@app.route("/mascotas", methods=["GET", "POST"])
def mascotas():
    if request.method == "POST":
        data, error_response = call_service("mascotas", "/mascotas", "POST", json=request.json)
    else:
        data, error_response = call_service("mascotas", "/mascotas")

    if error_response:
        return error_response

    return jsonify(data)


@app.route("/relacion")
def relacion():
    data, error_response = call_service("mascotas", "/relacion")
    if error_response:
        return error_response

    return jsonify(data)


@app.route("/resumen")
def resumen():
    usuarios_data, usuarios_error = call_service("usuarios", "/usuarios")
    mascotas_data, mascotas_error = call_service("mascotas", "/mascotas")

    status_code = 200 if not usuarios_error and not mascotas_error else 207
    return (
        jsonify(
            {
                "usuarios": usuarios_data,
                "mascotas": mascotas_data,
                "circuitos": {name: circuit.snapshot() for name, circuit in circuits.items()},
            }
        ),
        status_code,
    )


@app.route("/circuitos")
def estado_circuitos():
    return jsonify({name: circuit.snapshot() for name, circuit in circuits.items()})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
