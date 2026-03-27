/**
 * ESP32 Controller Firmware
 * -------------------------
 * Combines:
 *  - WiFi with AsyncWebServer (port 80)
 *  - BLE GATT server using the Nordic UART Service (NUS)
 *
 * HTTP Endpoints
 *  GET /status           -> JSON {"led":0,"relay":[0,0,0,0]}
 *  GET /led?value=on     -> turns LED on  ; replies {"led":1}
 *  GET /led?value=off    -> turns LED off ; replies {"led":0}
 *  GET /relay?ch=1&value=on  -> relay 1 on  ; replies {"relay":1,"state":1}
 *  GET /relay?ch=1&value=off -> relay 1 off ; replies {"relay":1,"state":0}
 *
 * BLE Commands (write to TX characteristic 6E400002-…)
 *  "LED:ON"        -> turn LED on
 *  "LED:OFF"       -> turn LED off
 *  "RELAY:1:ON"    -> relay 1 on
 *  "RELAY:1:OFF"   -> relay 1 off
 *  (channel 1-4)
 *
 * BLE Notifications (sent via RX characteristic 6E400003-…)
 *  "LED:ON" / "LED:OFF"
 *  "RELAY:1:ON" / "RELAY:1:OFF"
 *  "STATUS:<json>"
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------------------------------------------------------------------------
// WiFi credentials – change to your network
// ---------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ---------------------------------------------------------------------------
// GPIO pin definitions
// ---------------------------------------------------------------------------
#define LED_PIN 2
static const int RELAY_PINS[4] = {26, 27, 14, 12};
#define RELAY_COUNT 4

// ---------------------------------------------------------------------------
// NUS (Nordic UART Service) UUIDs
// ---------------------------------------------------------------------------
#define NUS_SERVICE_UUID        "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_CHAR_UUID_RX        "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"  // phone writes here
#define NUS_CHAR_UUID_TX        "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  // ESP32 notifies here

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
static bool ledState           = false;
static bool relayStates[RELAY_COUNT] = {false, false, false, false};

// ---------------------------------------------------------------------------
// BLE globals
// ---------------------------------------------------------------------------
BLEServer*          pServer    = nullptr;
BLECharacteristic*  pTxChar    = nullptr;   // notifications -> phone
static bool         bleConnected = false;

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
AsyncWebServer server(80);

// ---------------------------------------------------------------------------
// Forward declarations
// ---------------------------------------------------------------------------
void applyLed(bool on);
void applyRelay(int ch, bool on);
void parseBleCommand(const String& cmd);
void sendBleNotification(const String& msg);
String buildStatusJson();

// ===========================================================================
// BLE Callbacks
// ===========================================================================

class ServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* pSvr) override {
        bleConnected = true;
        Serial.println("[BLE] Client connected");
        // Push current state to newly connected device
        sendBleNotification(String("STATUS:") + buildStatusJson());
    }

    void onDisconnect(BLEServer* pSvr) override {
        bleConnected = false;
        Serial.println("[BLE] Client disconnected – restarting advertising");
        BLEDevice::startAdvertising();
    }
};

class RxCharCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pChar) override {
        std::string value = pChar->getValue();
        if (value.length() > 0) {
            String cmd = String(value.c_str());
            cmd.trim();
            Serial.print("[BLE] RX: ");
            Serial.println(cmd);
            parseBleCommand(cmd);
        }
    }
};

// ===========================================================================
// Setup helpers
// ===========================================================================

void setupPins() {
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    for (int i = 0; i < RELAY_COUNT; i++) {
        pinMode(RELAY_PINS[i], OUTPUT);
        digitalWrite(RELAY_PINS[i], LOW);
    }
    Serial.println("[PINS] GPIO configured");
}

void setupWifi() {
    Serial.print("[WiFi] Connecting to ");
    Serial.println(WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("[WiFi] Connected. IP: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("[WiFi] Failed to connect – continuing without WiFi");
    }
}

// Add CORS headers to every response
void addCorsHeaders(AsyncWebServerResponse* response) {
    response->addHeader("Access-Control-Allow-Origin",  "*");
    response->addHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type");
}

void setupHttpServer() {

    // OPTIONS pre-flight for CORS
    server.on("/*", HTTP_OPTIONS, [](AsyncWebServerRequest* request) {
        AsyncWebServerResponse* resp = request->beginResponse(204);
        addCorsHeaders(resp);
        request->send(resp);
    });

    // GET /status
    server.on("/status", HTTP_GET, [](AsyncWebServerRequest* request) {
        String body = buildStatusJson();
        Serial.print("[HTTP] GET /status -> ");
        Serial.println(body);
        AsyncWebServerResponse* resp = request->beginResponse(200, "application/json", body);
        addCorsHeaders(resp);
        request->send(resp);
    });

    // GET /led?value=on|off
    server.on("/led", HTTP_GET, [](AsyncWebServerRequest* request) {
        if (!request->hasParam("value")) {
            AsyncWebServerResponse* resp = request->beginResponse(400, "application/json",
                "{\"error\":\"Missing 'value' parameter\"}");
            addCorsHeaders(resp);
            request->send(resp);
            return;
        }
        String value = request->getParam("value")->value();
        value.toLowerCase();
        bool on = (value == "on" || value == "1" || value == "true");
        applyLed(on);

        String body = String("{\"led\":") + (on ? "1" : "0") + "}";
        Serial.print("[HTTP] GET /led?value=");
        Serial.print(value);
        Serial.print(" -> ");
        Serial.println(body);

        AsyncWebServerResponse* resp = request->beginResponse(200, "application/json", body);
        addCorsHeaders(resp);
        request->send(resp);
    });

    // GET /relay?ch=1&value=on|off
    server.on("/relay", HTTP_GET, [](AsyncWebServerRequest* request) {
        if (!request->hasParam("ch") || !request->hasParam("value")) {
            AsyncWebServerResponse* resp = request->beginResponse(400, "application/json",
                "{\"error\":\"Missing 'ch' or 'value' parameter\"}");
            addCorsHeaders(resp);
            request->send(resp);
            return;
        }
        int ch = request->getParam("ch")->value().toInt();
        if (ch < 1 || ch > RELAY_COUNT) {
            AsyncWebServerResponse* resp = request->beginResponse(400, "application/json",
                "{\"error\":\"Channel must be 1-4\"}");
            addCorsHeaders(resp);
            request->send(resp);
            return;
        }
        String value = request->getParam("value")->value();
        value.toLowerCase();
        bool on = (value == "on" || value == "1" || value == "true");
        applyRelay(ch, on);

        String body = String("{\"relay\":") + ch + ",\"state\":" + (on ? "1" : "0") + "}";
        Serial.print("[HTTP] GET /relay?ch=");
        Serial.print(ch);
        Serial.print("&value=");
        Serial.print(value);
        Serial.print(" -> ");
        Serial.println(body);

        AsyncWebServerResponse* resp = request->beginResponse(200, "application/json", body);
        addCorsHeaders(resp);
        request->send(resp);
    });

    // 404 handler
    server.onNotFound([](AsyncWebServerRequest* request) {
        AsyncWebServerResponse* resp = request->beginResponse(404, "application/json",
            "{\"error\":\"Not found\"}");
        addCorsHeaders(resp);
        request->send(resp);
    });

    server.begin();
    Serial.println("[HTTP] AsyncWebServer started on port 80");
}

void setupBle() {
    BLEDevice::init("ESP32_Controller");
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());

    BLEService* pService = pServer->createService(NUS_SERVICE_UUID);

    // RX characteristic: phone writes commands here
    BLECharacteristic* pRxChar = pService->createCharacteristic(
        NUS_CHAR_UUID_RX,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
    );
    pRxChar->setCallbacks(new RxCharCallbacks());

    // TX characteristic: ESP32 sends notifications here
    pTxChar = pService->createCharacteristic(
        NUS_CHAR_UUID_TX,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    pTxChar->addDescriptor(new BLE2902());

    pService->start();

    BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(NUS_SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);   // for iPhone connection compatibility
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();

    Serial.println("[BLE] GATT server started – advertising as 'ESP32_Controller'");
}

// ===========================================================================
// State application helpers
// ===========================================================================

void applyLed(bool on) {
    ledState = on;
    digitalWrite(LED_PIN, on ? HIGH : LOW);
    Serial.print("[GPIO] LED -> ");
    Serial.println(on ? "ON" : "OFF");
    sendBleNotification(String("LED:") + (on ? "ON" : "OFF"));
}

void applyRelay(int ch, bool on) {
    // ch is 1-based
    int idx = ch - 1;
    if (idx < 0 || idx >= RELAY_COUNT) return;
    relayStates[idx] = on;
    digitalWrite(RELAY_PINS[idx], on ? HIGH : LOW);
    Serial.print("[GPIO] Relay ");
    Serial.print(ch);
    Serial.print(" (GPIO ");
    Serial.print(RELAY_PINS[idx]);
    Serial.print(") -> ");
    Serial.println(on ? "ON" : "OFF");
    sendBleNotification(String("RELAY:") + ch + ":" + (on ? "ON" : "OFF"));
}

// ===========================================================================
// BLE command parser
// ===========================================================================

void parseBleCommand(const String& cmd) {
    String upper = cmd;
    upper.toUpperCase();

    if (upper == "LED:ON") {
        applyLed(true);
    } else if (upper == "LED:OFF") {
        applyLed(false);
    } else if (upper.startsWith("RELAY:")) {
        // Format: RELAY:<ch>:<ON|OFF>
        int firstColon = upper.indexOf(':');
        int secondColon = upper.indexOf(':', firstColon + 1);
        if (secondColon < 0) {
            Serial.println("[BLE] Malformed RELAY command");
            return;
        }
        int ch = upper.substring(firstColon + 1, secondColon).toInt();
        String stateStr = upper.substring(secondColon + 1);
        stateStr.trim();
        bool on = (stateStr == "ON" || stateStr == "1");
        applyRelay(ch, on);
    } else if (upper == "STATUS") {
        sendBleNotification(String("STATUS:") + buildStatusJson());
    } else {
        Serial.print("[BLE] Unknown command: ");
        Serial.println(cmd);
    }
}

// ===========================================================================
// BLE notification helper
// ===========================================================================

void sendBleNotification(const String& msg) {
    if (!bleConnected || pTxChar == nullptr) return;
    pTxChar->setValue(msg.c_str());
    pTxChar->notify();
    Serial.print("[BLE] TX notify: ");
    Serial.println(msg);
}

// ===========================================================================
// JSON status builder
// ===========================================================================

String buildStatusJson() {
    String json = "{\"led\":";
    json += ledState ? "1" : "0";
    json += ",\"relay\":[";
    for (int i = 0; i < RELAY_COUNT; i++) {
        json += relayStates[i] ? "1" : "0";
        if (i < RELAY_COUNT - 1) json += ",";
    }
    json += "]}";
    return json;
}

// ===========================================================================
// Arduino entry points
// ===========================================================================

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[BOOT] ESP32 Controller starting...");

    setupPins();
    setupWifi();
    setupHttpServer();
    setupBle();

    Serial.println("[BOOT] Setup complete");
    Serial.print("[BOOT] IP Address: ");
    Serial.println(WiFi.localIP());
}

void loop() {
    // AsyncWebServer and BLE are interrupt/callback driven – nothing needed here.
    // Add any periodic tasks below (e.g., sensor polling, watchdog, etc.).
    delay(10);
}
