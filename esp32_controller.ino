#include <WiFi.h>
#include <PubSubClient.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// WiFi & MQTT Setup
const char* ssid = "NAMA_WIFI_ANDA";
const char* password = "PASSWORD_WIFI";
const char* mqtt_server = "broker.hivemq.com";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// BLE Setup
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
BLECharacteristic *pCharacteristic;
bool deviceConnected = false;

// Logika Penerima Kontrol
void processCommand(String cmd) {
  Serial.print("[DATA DITERIMA]: ");
  Serial.println(cmd);

  if (cmd.startsWith("MODE:")) {
    String mode = cmd.substring(5);
    Serial.println("Mode Aktif: " + mode);
    // Tambahkan kontrol Relay / Motor sesuai Mode (SOFT, STRONG, AUTO, STANDARD, SPEED, STOP)
  } 
  else if (cmd.startsWith("SPEED:")) {
    int speedVal = cmd.substring(6).toInt();
    Serial.printf("Kelajuan: %d\n", speedVal);
    // Tambahkan kontrol PWM / Kecepatan Motor
  } 
  else if (cmd.startsWith("ACTION:")) {
    String action = cmd.substring(7);
    Serial.println("Eksekusi: " + action);
    // Tambahkan kontrol Relay WASH atau SPIN
  }
}

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) { deviceConnected = true; };
    void onDisconnect(BLEServer* pServer) { deviceConnected = false; }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string rxValue = pCharacteristic->getValue();
      if (rxValue.length() > 0) {
        String cmd = String(rxValue.c_str());
        processCommand(cmd);
      }
    }
};

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  processCommand(message);
}

void reconnectMQTT() {
  if (!mqttClient.connected()) {
    if (mqttClient.connect("ESP32_WashingMachine_Client")) {
      mqttClient.subscribe("washing_machine/control");
    }
  }
}

void setup() {
  Serial.begin(115200);

  // Init WiFi
  WiFi.begin(ssid, password);
  
  // Init BLE
  BLEDevice::init("ESP32_WashingMachine");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_WRITE |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  pCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();
  pServer->getAdvertising()->start();

  // Init MQTT
  mqttClient.setServer(mqtt_server, 1883);
  mqttClient.setCallback(mqttCallback);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      reconnectMQTT();
    }
    mqttClient.loop();
  }
}
// Contoh format data yang dikirim ESP32 ke Web:
// "REMAIN:300,ELAPSED:150,STATUS:WASH"

void sendRealtimeStatusToWeb(int sisaDetik, int berjalanDetik, String statusProses) {
  String payload = "REMAIN:" + String(sisaDetik) + 
                   ",ELAPSED:" + String(berjalanDetik) + 
                   ",STATUS:" + statusProses;

  // Send via BLE Notify (jika terhubung)
  if (deviceConnected) {
    pCharacteristic->setValue(payload.c_str());
    pCharacteristic->notify();
  }

  // Send via MQTT Publish (jika WiFi terhubung)
  if (mqttClient.connected()) {
    mqttClient.publish("washing_machine/status", payload.c_str());
  }
}