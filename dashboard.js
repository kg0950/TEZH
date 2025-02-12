#include <WiFi.h>
#include <FirebaseESP32.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include "HX711.h"
#include <LiquidCrystal_I2C.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>

// WiFi Credentials
#define WIFI_SSID "Your_WiFi_SSID"
#define WIFI_PASSWORD "Your_WiFi_Password"

// Firebase Credentials
#define FIREBASE_HOST "your-project.firebaseio.com"
#define FIREBASE_AUTH "your-firebase-auth-key"

FirebaseData fbData;
FirebaseAuth auth;
FirebaseConfig config;

Adafruit_INA219 ina219; // Voltage/Current Sensor
HX711 scale; // Load cell for weight estimation
LiquidCrystal_I2C lcd(0x27, 16, 2); // LCD Display
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org");

// HX711 Pins
#define LOADCELL_DOUT  5
#define LOADCELL_SCK   4

// Buzzer for Alerts
#define BUZZER_PIN  15

// Battery Monitoring (Example - Modify Based on Your Setup)
#define BATTERY_PIN 34 

int vehicleCount = 0; // Counter for passing vehicles
float voltage, current, power, weight, batteryLevel;
unsigned long lastVehicleTime = 0; // Time of last vehicle detection
const float weightThreshold = 50; // Adjust based on calibration

void setup() {
    Serial.begin(115200);
    
    // Connect to WiFi
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("Connected!");

    // Start NTP Client for Timestamp
    timeClient.begin();
    timeClient.setTimeOffset(19800); // UTC+5:30 (Adjust for your region)

    // Initialize Firebase
    config.host = FIREBASE_HOST;
    config.signer.tokens.legacy_token = FIREBASE_AUTH;
    Firebase.begin(&config, &auth);

    // Initialize Sensors
    ina219.begin();
    scale.begin(LOADCELL_DOUT, LOADCELL_SCK);
    scale.set_scale();  // Calibrate based on actual weight measurements
    scale.tare();

    // Initialize LCD
    lcd.init();
    lcd.backlight();
    lcd.setCursor(0, 0);
    lcd.print("TEZH System");

    // Initialize Buzzer
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);

    // OTA Setup
    ArduinoOTA.begin();
}

void loop() {
    ArduinoOTA.handle(); // Check for OTA updates
    timeClient.update();
    String timestamp = timeClient.getFormattedTime();

    // Read Sensor Data
    voltage = ina219.getBusVoltage_V();
    current = ina219.getCurrent_mA() / 1000.0; // Convert mA to A
    power = voltage * current;
    weight = scale.get_units();
    batteryLevel = analogRead(BATTERY_PIN) * (3.3 / 4095.0) * 2; // Battery voltage reading

    // Detect Vehicle Based on Weight Fluctuation
    if (weight > weightThreshold) { 
        if (millis() - lastVehicleTime > 2000) { // Avoid counting same vehicle multiple times
            vehicleCount++;
            lastVehicleTime = millis();
            Serial.println("Vehicle detected!");
            delay(500);
        }
    }

    // Display Data on LCD
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("V:"); lcd.print(voltage, 2); lcd.print("V ");
    lcd.setCursor(0, 1);
    lcd.print("P:"); lcd.print(power, 2); lcd.print("W ");

    // Print to Serial
    Serial.print("Voltage: "); Serial.print(voltage); Serial.println(" V");
    Serial.print("Current: "); Serial.print(current); Serial.println(" A");
    Serial.print("Power: "); Serial.print(power); Serial.println(" W");
    Serial.print("Weight: "); Serial.print(weight); Serial.println(" kg");
    Serial.print("Battery: "); Serial.print(batteryLevel); Serial.println(" V");
    Serial.print("Vehicle Count: "); Serial.println(vehicleCount);
    Serial.println("-------------------------");

    // Send Data to Firebase
    Firebase.setFloat(fbData, "/TEZH/voltage", voltage);
    Firebase.setFloat(fbData, "/TEZH/current", current);
    Firebase.setFloat(fbData, "/TEZH/power", power);
    Firebase.setFloat(fbData, "/TEZH/weight", weight);
    Firebase.setFloat(fbData, "/TEZH/battery", batteryLevel);
    Firebase.setInt(fbData, "/TEZH/vehicle_count", vehicleCount);
    Firebase.setString(fbData, "/TEZH/timestamp", timestamp);

    // Activate Buzzer Alert if Power Generation is Too Low
    if (power < 1.0) { // Example threshold (adjust as needed)
        digitalWrite(BUZZER_PIN, HIGH);
        delay(1000);
        digitalWrite(BUZZER_PIN, LOW);
    }

    // Delay before next reading
    delay(5000);
}
