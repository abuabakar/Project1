package com.esp32controller

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.ActivityCompat
import java.util.UUID

class BleManager(private val context: Context) {

    companion object {
        private const val TAG = "BleManager"
        private const val ESP32_DEVICE_NAME = "ESP32_Controller"
        val SERVICE_UUID: UUID = UUID.fromString("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
        val CHAR_UUID_TX: UUID = UUID.fromString("6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
        val CHAR_UUID_RX: UUID = UUID.fromString("6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
        val CLIENT_CHARACTERISTIC_CONFIG_UUID: UUID =
            UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }

    // Callback interfaces
    var onDeviceFound: ((BluetoothDevice) -> Unit)? = null
    var onConnected: (() -> Unit)? = null
    var onDisconnected: (() -> Unit)? = null
    var onDataReceived: ((ByteArray) -> Unit)? = null
    var onScanError: ((String) -> Unit)? = null
    var onWriteComplete: ((Boolean) -> Unit)? = null

    private val bluetoothManager: BluetoothManager =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    private var bluetoothLeScanner: BluetoothLeScanner? = null
    private var bluetoothGatt: BluetoothGatt? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var isScanning = false
    private val discoveredDevices = mutableSetOf<String>()

    // GATT callback handling connection events, service discovery, and data
    private val gattCallback = object : BluetoothGattCallback() {

        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                Log.d(TAG, "Connected to GATT server. Discovering services...")
                if (hasConnectPermission()) {
                    gatt.discoverServices()
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.d(TAG, "Disconnected from GATT server.")
                txCharacteristic = null
                bluetoothGatt = null
                onDisconnected?.invoke()
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Services discovered successfully.")
                val service = gatt.getService(SERVICE_UUID)
                if (service != null) {
                    txCharacteristic = service.getCharacteristic(CHAR_UUID_TX)
                    val rxCharacteristic = service.getCharacteristic(CHAR_UUID_RX)
                    if (rxCharacteristic != null && hasConnectPermission()) {
                        // Enable notifications for RX characteristic
                        gatt.setCharacteristicNotification(rxCharacteristic, true)
                        val descriptor = rxCharacteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID)
                        descriptor?.let {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                gatt.writeDescriptor(it, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                            } else {
                                @Suppress("DEPRECATION")
                                it.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                                @Suppress("DEPRECATION")
                                gatt.writeDescriptor(it)
                            }
                        }
                    }
                    Log.d(TAG, "Nordic UART Service found and TX characteristic set.")
                    onConnected?.invoke()
                } else {
                    Log.w(TAG, "Nordic UART Service not found on device.")
                    onDisconnected?.invoke()
                }
            } else {
                Log.w(TAG, "Service discovery failed with status: $status")
                onDisconnected?.invoke()
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            val success = status == BluetoothGatt.GATT_SUCCESS
            Log.d(TAG, "Characteristic write complete. Success: $success")
            onWriteComplete?.invoke(success)
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                @Suppress("DEPRECATION")
                characteristic.value?.let { onDataReceived?.invoke(it) }
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            Log.d(TAG, "Data received: ${String(value)}")
            onDataReceived?.invoke(value)
        }
    }

    // BLE scan callback
    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            if (!hasConnectPermission()) return
            val deviceName = device.name ?: return
            if (deviceName == ESP32_DEVICE_NAME && !discoveredDevices.contains(device.address)) {
                Log.d(TAG, "Found ESP32 device: ${device.address}")
                discoveredDevices.add(device.address)
                onDeviceFound?.invoke(device)
            }
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            results.forEach { result ->
                val device = result.device
                if (!hasConnectPermission()) return
                val deviceName = device.name ?: return
                if (deviceName == ESP32_DEVICE_NAME && !discoveredDevices.contains(device.address)) {
                    discoveredDevices.add(device.address)
                    onDeviceFound?.invoke(device)
                }
            }
        }

        override fun onScanFailed(errorCode: Int) {
            val errorMessage = when (errorCode) {
                SCAN_FAILED_ALREADY_STARTED -> "Scan already started"
                SCAN_FAILED_APPLICATION_REGISTRATION_FAILED -> "Application registration failed"
                SCAN_FAILED_INTERNAL_ERROR -> "Internal error"
                SCAN_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                else -> "Unknown error code: $errorCode"
            }
            Log.e(TAG, "Scan failed: $errorMessage")
            isScanning = false
            onScanError?.invoke(errorMessage)
        }
    }

    fun isBluetoothEnabled(): Boolean = bluetoothAdapter?.isEnabled == true

    fun startScan() {
        if (bluetoothAdapter == null) {
            onScanError?.invoke("Bluetooth not supported on this device")
            return
        }
        if (!isBluetoothEnabled()) {
            onScanError?.invoke("Bluetooth is not enabled")
            return
        }
        if (!hasScanPermission()) {
            onScanError?.invoke("Bluetooth scan permission not granted")
            return
        }
        if (isScanning) {
            Log.d(TAG, "Already scanning")
            return
        }

        discoveredDevices.clear()
        bluetoothLeScanner = bluetoothAdapter.bluetoothLeScanner

        val scanFilter = ScanFilter.Builder()
            .setDeviceName(ESP32_DEVICE_NAME)
            .build()

        val scanSettings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        bluetoothLeScanner?.startScan(listOf(scanFilter), scanSettings, scanCallback)
        isScanning = true
        Log.d(TAG, "BLE scan started")
    }

    fun stopScan() {
        if (!isScanning) return
        if (!hasScanPermission()) return
        bluetoothLeScanner?.stopScan(scanCallback)
        isScanning = false
        Log.d(TAG, "BLE scan stopped")
    }

    fun connectToDevice(device: BluetoothDevice) {
        if (!hasConnectPermission()) {
            Log.e(TAG, "BLUETOOTH_CONNECT permission not granted")
            return
        }
        stopScan()
        bluetoothGatt?.close()
        bluetoothGatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        Log.d(TAG, "Connecting to device: ${device.address}")
    }

    fun disconnect() {
        if (!hasConnectPermission()) return
        bluetoothGatt?.let { gatt ->
            gatt.disconnect()
            gatt.close()
        }
        bluetoothGatt = null
        txCharacteristic = null
        Log.d(TAG, "Disconnected and GATT closed")
    }

    fun sendCommand(data: ByteArray): Boolean {
        val gatt = bluetoothGatt ?: run {
            Log.e(TAG, "GATT not connected")
            return false
        }
        val characteristic = txCharacteristic ?: run {
            Log.e(TAG, "TX characteristic not available")
            return false
        }
        if (!hasConnectPermission()) {
            Log.e(TAG, "BLUETOOTH_CONNECT permission not granted")
            return false
        }

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val result = gatt.writeCharacteristic(
                characteristic,
                data,
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            )
            result == BluetoothGatt.GATT_SUCCESS
        } else {
            @Suppress("DEPRECATION")
            characteristic.value = data
            @Suppress("DEPRECATION")
            characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            @Suppress("DEPRECATION")
            gatt.writeCharacteristic(characteristic)
        }
    }

    fun isConnected(): Boolean = bluetoothGatt != null && txCharacteristic != null

    fun cleanup() {
        stopScan()
        disconnect()
    }

    private fun hasScanPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ActivityCompat.checkSelfPermission(
                context, Manifest.permission.BLUETOOTH_SCAN
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            ActivityCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun hasConnectPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ActivityCompat.checkSelfPermission(
                context, Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }
}
