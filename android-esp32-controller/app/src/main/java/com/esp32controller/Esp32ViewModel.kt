package com.esp32controller

import android.app.Application
import android.bluetooth.BluetoothDevice
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

class Esp32ViewModel(application: Application) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "Esp32ViewModel"
        private const val MAX_LOG_LINES = 10
        private const val RELAY_COUNT = 4
    }

    // ---------- BLE ----------
    val bleManager: BleManager = BleManager(application)

    private val _connectionStatus = MutableLiveData<String>("Disconnected")
    val connectionStatus: LiveData<String> = _connectionStatus

    private val _bleDeviceList = MutableLiveData<List<BluetoothDevice>>(emptyList())
    val bleDeviceList: LiveData<List<BluetoothDevice>> = _bleDeviceList

    private val _isBleScanActive = MutableLiveData(false)
    val isBleScanActive: LiveData<Boolean> = _isBleScanActive

    private val _isBleConnected = MutableLiveData(false)
    val isBleConnected: LiveData<Boolean> = _isBleConnected

    // ---------- WiFi ----------
    val wifiController: WifiController = WifiController()

    private val _wifiStatus = MutableLiveData<String>("Not connected")
    val wifiStatus: LiveData<String> = _wifiStatus

    private val _esp32IpAddress = MutableLiveData<String>("")
    val esp32IpAddress: LiveData<String> = _esp32IpAddress

    // ---------- Shared device state ----------
    private val _ledState = MutableLiveData(false)
    val ledState: LiveData<Boolean> = _ledState

    private val _relayStates = MutableLiveData<List<Boolean>>(List(RELAY_COUNT) { false })
    val relayStates: LiveData<List<Boolean>> = _relayStates

    // ---------- Log ----------
    private val _logMessages = MutableLiveData<List<String>>(emptyList())
    val logMessages: LiveData<List<String>> = _logMessages

    // ---------- Discovered BLE devices accumulator ----------
    private val _discoveredDevices = mutableListOf<BluetoothDevice>()

    init {
        setupBleCallbacks()
    }

    // -----------------------------------------------------------------------
    // BLE
    // -----------------------------------------------------------------------

    private fun setupBleCallbacks() {
        bleManager.onDeviceFound = { device ->
            if (_discoveredDevices.none { it.address == device.address }) {
                _discoveredDevices.add(device)
                _bleDeviceList.postValue(_discoveredDevices.toList())
                addLog("BLE: Found device ${device.address}")
            }
        }

        bleManager.onConnected = {
            _isBleConnected.postValue(true)
            _connectionStatus.postValue("BLE Connected")
            addLog("BLE: Connected successfully")
        }

        bleManager.onDisconnected = {
            _isBleConnected.postValue(false)
            _connectionStatus.postValue("Disconnected")
            addLog("BLE: Disconnected")
        }

        bleManager.onDataReceived = { data ->
            val message = String(data, Charsets.UTF_8).trim()
            addLog("BLE RX: $message")
            parseIncomingBleData(message)
        }

        bleManager.onScanError = { error ->
            _isBleScanActive.postValue(false)
            addLog("BLE Scan error: $error")
        }

        bleManager.onWriteComplete = { success ->
            if (!success) {
                addLog("BLE: Write failed")
            }
        }
    }

    /** Parses state update messages pushed from the ESP32 over BLE. */
    private fun parseIncomingBleData(message: String) {
        when {
            message.startsWith("LED:") -> {
                val state = message.substringAfter("LED:").trim().uppercase() == "ON"
                _ledState.postValue(state)
            }
            message.startsWith("RELAY:") -> {
                val parts = message.split(":")
                if (parts.size == 3) {
                    val ch = parts[1].toIntOrNull()
                    val state = parts[2].trim().uppercase() == "ON"
                    if (ch != null && ch in 1..RELAY_COUNT) {
                        val current = _relayStates.value?.toMutableList() ?: MutableList(RELAY_COUNT) { false }
                        current[ch - 1] = state
                        _relayStates.postValue(current)
                    }
                }
            }
            message.startsWith("STATUS:") -> {
                addLog("ESP32 status: ${message.substringAfter("STATUS:")}")
            }
        }
    }

    fun startBleScan() {
        _discoveredDevices.clear()
        _bleDeviceList.value = emptyList()
        _isBleScanActive.value = true
        addLog("BLE: Starting scan for ESP32_Controller…")
        bleManager.startScan()
    }

    fun stopBleScan() {
        bleManager.stopScan()
        _isBleScanActive.value = false
        addLog("BLE: Scan stopped")
    }

    fun connectBle(device: BluetoothDevice) {
        addLog("BLE: Connecting to ${device.address}…")
        _connectionStatus.value = "Connecting…"
        bleManager.connectToDevice(device)
    }

    fun connectBle() {
        // Connect to the first discovered device
        val device = _discoveredDevices.firstOrNull()
        if (device != null) {
            connectBle(device)
        } else {
            addLog("BLE: No device discovered – start scan first")
        }
    }

    fun disconnectBle() {
        bleManager.disconnect()
        _isBleConnected.value = false
        _connectionStatus.value = "Disconnected"
        addLog("BLE: Disconnected by user")
    }

    fun sendBleLed(on: Boolean) {
        val cmd = if (on) "LED:ON" else "LED:OFF"
        val success = bleManager.sendCommand(cmd.toByteArray(Charsets.UTF_8))
        if (success) {
            _ledState.value = on
            addLog("BLE TX: $cmd")
        } else {
            addLog("BLE: Failed to send $cmd (not connected?)")
        }
    }

    fun sendBleRelay(ch: Int, on: Boolean) {
        val cmd = "RELAY:$ch:${if (on) "ON" else "OFF"}"
        val success = bleManager.sendCommand(cmd.toByteArray(Charsets.UTF_8))
        if (success) {
            val current = _relayStates.value?.toMutableList() ?: MutableList(RELAY_COUNT) { false }
            if (ch in 1..RELAY_COUNT) current[ch - 1] = on
            _relayStates.value = current
            addLog("BLE TX: $cmd")
        } else {
            addLog("BLE: Failed to send $cmd")
        }
    }

    // -----------------------------------------------------------------------
    // WiFi
    // -----------------------------------------------------------------------

    fun setIpAddress(ip: String) {
        _esp32IpAddress.value = ip.trim()
        wifiController.updateIpAddress(ip)
        addLog("WiFi: IP set to $ip")
    }

    fun connectWifi() {
        viewModelScope.launch {
            val ip = _esp32IpAddress.value.orEmpty()
            if (ip.isBlank()) {
                _wifiStatus.value = "Enter IP address first"
                addLog("WiFi: No IP address set")
                return@launch
            }
            _wifiStatus.value = "Connecting…"
            addLog("WiFi: Connecting to $ip…")
            wifiController.getStatus().fold(
                onSuccess = { body ->
                    _wifiStatus.value = "Connected – $body"
                    addLog("WiFi: Connected. Status: $body")
                    parseWifiStatus(body)
                },
                onFailure = { err ->
                    _wifiStatus.value = "Connection failed: ${err.message}"
                    addLog("WiFi: Error – ${err.message}")
                }
            )
        }
    }

    /** Parses a simple JSON-like status response from the ESP32. */
    private fun parseWifiStatus(body: String) {
        try {
            // Expected format: {"led":0,"relay":[0,0,0,0]}
            val ledMatch = Regex(""""led"\s*:\s*(\d)""").find(body)
            ledMatch?.groupValues?.get(1)?.toIntOrNull()?.let { v ->
                _ledState.postValue(v == 1)
            }
            val relayMatch = Regex(""""relay"\s*:\s*\[([01,\s]+)]""").find(body)
            relayMatch?.groupValues?.get(1)?.let { arr ->
                val states = arr.split(",").mapIndexed { idx, s ->
                    idx < RELAY_COUNT && s.trim() == "1"
                }.take(RELAY_COUNT)
                if (states.size == RELAY_COUNT) _relayStates.postValue(states)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not parse status JSON: ${e.message}")
        }
    }

    fun setLed(on: Boolean) {
        // Send over both transports if available
        if (bleManager.isConnected()) sendBleLed(on)

        viewModelScope.launch {
            if (!wifiController.hasValidIpAddress()) return@launch
            wifiController.setLed(on).fold(
                onSuccess = { body ->
                    _ledState.postValue(on)
                    addLog("WiFi LED ${if (on) "ON" else "OFF"}: $body")
                },
                onFailure = { err ->
                    addLog("WiFi LED error: ${err.message}")
                }
            )
        }
    }

    fun setRelay(ch: Int, on: Boolean) {
        if (bleManager.isConnected()) sendBleRelay(ch, on)

        viewModelScope.launch {
            if (!wifiController.hasValidIpAddress()) return@launch
            wifiController.setRelay(ch, on).fold(
                onSuccess = { body ->
                    val current = _relayStates.value?.toMutableList() ?: MutableList(RELAY_COUNT) { false }
                    if (ch in 1..RELAY_COUNT) current[ch - 1] = on
                    _relayStates.postValue(current)
                    addLog("WiFi Relay $ch ${if (on) "ON" else "OFF"}: $body")
                },
                onFailure = { err ->
                    addLog("WiFi Relay $ch error: ${err.message}")
                }
            )
        }
    }

    fun sendCustomCommand(cmd: String) {
        val trimmed = cmd.trim()
        if (trimmed.isBlank()) return

        // Try BLE first
        if (bleManager.isConnected()) {
            val success = bleManager.sendCommand(trimmed.toByteArray(Charsets.UTF_8))
            addLog("BLE TX custom: $trimmed ${if (success) "OK" else "FAIL"}")
        }

        // Then WiFi (treat as raw endpoint)
        viewModelScope.launch {
            if (!wifiController.hasValidIpAddress()) return@launch
            wifiController.sendRawCommand(trimmed).fold(
                onSuccess = { body -> addLog("WiFi custom response: $body") },
                onFailure = { err -> addLog("WiFi custom error: ${err.message}") }
            )
        }
    }

    // -----------------------------------------------------------------------
    // Logging
    // -----------------------------------------------------------------------

    fun addLog(message: String) {
        Log.d(TAG, message)
        val current = _logMessages.value?.toMutableList() ?: mutableListOf()
        current.add(0, message)               // newest at top
        if (current.size > MAX_LOG_LINES) current.subList(MAX_LOG_LINES, current.size).clear()
        _logMessages.postValue(current)
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    override fun onCleared() {
        super.onCleared()
        bleManager.cleanup()
        wifiController.shutdown()
    }
}
