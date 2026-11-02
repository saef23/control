const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleDevice, bleCharacteristic;
let mqttClient;

async function toggleBluetooth() {
    if (!bleDevice || !bleDevice.gatt.connected) {
        try {
            bleDevice = await navigator.bluetooth.requestDevice({
                filters: [{ name: 'ESP32_WashingMachine' }],
                optionalServices: [SERVICE_UUID]
            });
            const server = await bleDevice.gatt.connect();
            const service = await server.getPrimaryService(SERVICE_UUID);
            bleCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

            document.getElementById('bt-indicator').classList.add('connected');
            document.getElementById('bt-text').innerText = 'BLE: Terhubung';
            document.getElementById('bt-btn').innerText = 'Putus';
        } catch (err) {
            console.error("BLE Error:", err);
        }
    } else {
        bleDevice.gatt.disconnect();
        document.getElementById('bt-indicator').classList.remove('connected');
        document.getElementById('bt-text').innerText = 'BLE: Terputus';
        document.getElementById('bt-btn').innerText = 'Konek BLE';
    }
}

function toggleMQTT() {
    if (!mqttClient || !mqttClient.isConnected()) {
        const broker = "broker.hivemq.com";
        const port = 8000;
        mqttClient = new Paho.MQTT.Client(broker, port, "web_client_" + parseInt(Math.random() * 100, 10));

        mqttClient.connect({
            onSuccess: () => {
                document.getElementById('mqtt-indicator').classList.add('connected');
                document.getElementById('mqtt-text').innerText = 'MQTT: Terhubung';
                document.getElementById('mqtt-btn').innerText = 'Putus';
            },
            onFailure: (err) => console.error("MQTT Error:", err)
        });
    } else {
        mqttClient.disconnect();
        document.getElementById('mqtt-indicator').classList.remove('connected');
        document.getElementById('mqtt-text').innerText = 'MQTT: Terputus';
        document.getElementById('mqtt-btn').innerText = 'Konek MQTT';
    }
}

function sendData(payload) {
    console.log("Mengirim:", payload);
    if (bleCharacteristic) {
        const encoder = new TextEncoder();
        bleCharacteristic.writeValue(encoder.encode(payload)).catch(console.error);
    }
    if (mqttClient && mqttClient.isConnected()) {
        const message = new Paho.MQTT.Message(payload);
        message.destinationName = "washing_machine/control";
        mqttClient.send(message);
    }
}

function selectMode(mode, btn) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('process-display').innerText = mode;
    sendData(`MODE:${mode}`);
}

// Menghitung detik ke menit:detik
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateSlider(val) {
    const formatted = formatTime(val);
    document.getElementById('slider-val').innerText = `${val} Detik (${formatted})`;
}

function sendSliderData(val) {
    sendData(`DURATION:${val}`);
}

function triggerAction(action) {
    const washBtn = document.getElementById('wash-btn');
    const spinBtn = document.getElementById('spin-btn');
    
    if (action === 'WASH') {
        washBtn.classList.toggle('active-action');
        spinBtn.classList.remove('active-action');
    } else {
        spinBtn.classList.toggle('active-action');
        washBtn.classList.remove('active-action');
    }

    document.getElementById('process-display').innerText = action;
    sendData(`ACTION:${action}`);
}
// ================= PENERIMA DATA REALTIME DARI ESP32 =================

// 1. Menerima Data via BLE Notifications
function setupBLENotifications(characteristic) {
    characteristic.startNotifications().then(() => {
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const decoder = new TextDecoder('utf-8');
            const data = decoder.decode(event.target.value);
            parseRealtimeData(data);
        });
    });
}

// 2. Menerima Data via MQTT Subscription
function setupMQTTSubscription() {
    if (mqttClient && mqttClient.isConnected()) {
        mqttClient.subscribe("washing_machine/status");
        mqttClient.onMessageArrived = (message) => {
            parseRealtimeData(message.payloadString);
        };
    }
}

// 3. Parser Data Realtime dari ESP32
// Format yang diharapkan dari ESP32: "REMAIN:450,ELAPSED:30,STATUS:WASH"
function parseRealtimeData(dataString) {
    console.log("Data Realtime dari ESP32:", dataString);
    
    const items = dataString.split(',');
    items.forEach(item => {
        const [key, value] = item.split(':');
        
        if (key === 'REMAIN') {
            document.getElementById('timer-display').innerText = formatTime(parseInt(value));
        } 
        else if (key === 'ELAPSED') {
            document.getElementById('elapsed-display').innerText = formatTime(parseInt(value));
        } 
        else if (key === 'STATUS') {
            document.getElementById('process-display').innerText = value;
            
            // Jika proses selesai atau standby
            if (value === 'STANDBY' || value === 'DONE') {
                document.getElementById('wash-btn').classList.remove('active-action');
                document.getElementById('spin-btn').classList.remove('active-action');
            }
        }
    });
}