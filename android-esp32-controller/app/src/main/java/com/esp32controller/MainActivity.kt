package com.esp32controller

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ListView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import com.google.android.material.tabs.TabLayout

@Suppress("DEPRECATION") // Switch widget is fine for this project
class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
    }

    private lateinit var viewModel: Esp32ViewModel

    // ----- Tab / panel views -----
    private lateinit var tabLayout: TabLayout
    private lateinit var blePanelContainer: FrameLayout
    private lateinit var wifiPanelContainer: FrameLayout

    // ----- BLE panel -----
    private lateinit var scanButton: Button
    private lateinit var deviceListView: ListView
    private lateinit var connectButton: Button
    private lateinit var ledToggle: Switch
    private lateinit var relay1Toggle: Switch
    private lateinit var relay2Toggle: Switch
    private lateinit var relay3Toggle: Switch
    private lateinit var relay4Toggle: Switch

    // ----- WiFi panel -----
    private lateinit var ipInput: EditText
    private lateinit var wifiConnectButton: Button
    private lateinit var wifiLedToggle: Switch
    private lateinit var wifiRelay1Toggle: Switch
    private lateinit var wifiRelay2Toggle: Switch
    private lateinit var wifiRelay3Toggle: Switch
    private lateinit var wifiRelay4Toggle: Switch
    private lateinit var statusText: TextView

    // ----- Log -----
    private lateinit var logOutput: TextView

    // ----- BLE device list adapter -----
    private lateinit var deviceAdapter: ArrayAdapter<String>
    private val deviceAddressMap = mutableMapOf<Int, BluetoothDevice>()

    // ----- Permission launcher -----
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val allGranted = results.values.all { it }
        if (allGranted) {
            viewModel.startBleScan()
        } else {
            Toast.makeText(this, getString(R.string.ble_permissions_denied), Toast.LENGTH_LONG).show()
        }
    }

    // Guards to prevent feedback loops when programmatically toggling switches
    private var isSyncingUi = false

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        viewModel = ViewModelProvider(this)[Esp32ViewModel::class.java]

        bindViews()
        setupTabs()
        setupBlePanel()
        setupWifiPanel()
        observeViewModel()
    }

    override fun onDestroy() {
        super.onDestroy()
        viewModel.bleManager.cleanup()
    }

    // -----------------------------------------------------------------------
    // View binding
    // -----------------------------------------------------------------------

    private fun bindViews() {
        tabLayout = findViewById(R.id.tab_layout)
        blePanelContainer = findViewById(R.id.ble_panel_container)
        wifiPanelContainer = findViewById(R.id.wifi_panel_container)

        // BLE panel
        scanButton = findViewById(R.id.scan_button)
        deviceListView = findViewById(R.id.device_list)
        connectButton = findViewById(R.id.connect_button)
        ledToggle = findViewById(R.id.led_toggle)
        relay1Toggle = findViewById(R.id.relay_1)
        relay2Toggle = findViewById(R.id.relay_2)
        relay3Toggle = findViewById(R.id.relay_3)
        relay4Toggle = findViewById(R.id.relay_4)

        // WiFi panel
        ipInput = findViewById(R.id.ip_input)
        wifiConnectButton = findViewById(R.id.wifi_connect_button)
        wifiLedToggle = findViewById(R.id.wifi_led_toggle)
        wifiRelay1Toggle = findViewById(R.id.wifi_relay_1)
        wifiRelay2Toggle = findViewById(R.id.wifi_relay_2)
        wifiRelay3Toggle = findViewById(R.id.wifi_relay_3)
        wifiRelay4Toggle = findViewById(R.id.wifi_relay_4)
        statusText = findViewById(R.id.status_text)

        // Log
        logOutput = findViewById(R.id.log_output)
    }

    // -----------------------------------------------------------------------
    // Tab setup
    // -----------------------------------------------------------------------

    private fun setupTabs() {
        tabLayout.addTab(tabLayout.newTab().setText(R.string.tab_ble))
        tabLayout.addTab(tabLayout.newTab().setText(R.string.tab_wifi))

        blePanelContainer.visibility = View.VISIBLE
        wifiPanelContainer.visibility = View.GONE

        tabLayout.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                blePanelContainer.visibility = if (tab.position == 0) View.VISIBLE else View.GONE
                wifiPanelContainer.visibility = if (tab.position == 1) View.VISIBLE else View.GONE
            }
            override fun onTabUnselected(tab: TabLayout.Tab) {}
            override fun onTabReselected(tab: TabLayout.Tab) {}
        })
    }

    // -----------------------------------------------------------------------
    // BLE panel setup
    // -----------------------------------------------------------------------

    private fun setupBlePanel() {
        deviceAdapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, mutableListOf())
        deviceListView.adapter = deviceAdapter

        scanButton.setOnClickListener {
            if (viewModel.isBleScanActive.value == true) {
                viewModel.stopBleScan()
            } else {
                requestBlePermissionsAndScan()
            }
        }

        deviceListView.onItemClickListener = AdapterView.OnItemClickListener { _, _, position, _ ->
            deviceAddressMap[position]?.let { device ->
                viewModel.connectBle(device)
            }
        }

        connectButton.setOnClickListener {
            if (viewModel.isBleConnected.value == true) {
                viewModel.disconnectBle()
            } else {
                viewModel.connectBle()
            }
        }

        ledToggle.setOnCheckedChangeListener { _, isChecked ->
            if (!isSyncingUi) viewModel.sendBleLed(isChecked)
        }

        relay1Toggle.setOnCheckedChangeListener { _, isChecked ->
            if (!isSyncingUi) viewModel.sendBleRelay(1, isChecked)
        }
        relay2Toggle.setOnCheckedChangeListener { _, isChecked ->
            if (!isSyncingUi) viewModel.sendBleRelay(2, isChecked)
        }
        relay3Toggle.setOnCheckedChangeListener { _, isChecked ->
            if (!isSyncingUi) viewModel.sendBleRelay(3, isChecked)
        }
        relay4Toggle.setOnCheckedChangeListener { _, isChecked ->
            if (!isSyncingUi) viewModel.sendBleRelay(4, isChecked)
        }
    }

    // -----------------------------------------------------------------------
    // WiFi panel setup
    // -----------------------------------------------------------------------

    private fun setupWifiPanel() {
        ipInput.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI

        wifiConnectButton.setOnClickListener {
            val ip = ipInput.text.toString().trim()
            if (ip.isBlank()) {
                Toast.makeText(this, getString(R.string.enter_ip_address), Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            viewModel.setIpAddress(ip)
            viewModel.connectWifi()
        }

        wifiLedToggle.setOnCheckedChangeListener { _, isChecked ->
            if (!isSyncingUi) viewModel.setLed(isChecked)
        }

        wifiRelay1Toggle.setOnCheckedChangeListener { _, isChecked ->
            if (!isSyncingUi) viewModel.setRelay(1, isChecked)
        }
        wifiRelay2Toggle.setOnCheckedChangeListener { _, isChecked ->
            if (!isSyncingUi) viewModel.setRelay(2, isChecked)
        }
        wifiRelay3Toggle.setOnCheckedChangeListener { _, isChecked ->
            if (!isSyncingUi) viewModel.setRelay(3, isChecked)
        }
        wifiRelay4Toggle.setOnCheckedChangeListener { _, isChecked ->
            if (!isSyncingUi) viewModel.setRelay(4, isChecked)
        }
    }

    // -----------------------------------------------------------------------
    // LiveData observation
    // -----------------------------------------------------------------------

    private fun observeViewModel() {

        viewModel.connectionStatus.observe(this) { status ->
            connectButton.text = if (viewModel.isBleConnected.value == true)
                getString(R.string.disconnect)
            else
                getString(R.string.connect)
            viewModel.addLog("Status: $status")
        }

        viewModel.isBleConnected.observe(this) { connected ->
            connectButton.text = if (connected)
                getString(R.string.disconnect)
            else
                getString(R.string.connect)
            ledToggle.isEnabled = connected
            relay1Toggle.isEnabled = connected
            relay2Toggle.isEnabled = connected
            relay3Toggle.isEnabled = connected
            relay4Toggle.isEnabled = connected
        }

        viewModel.isBleScanActive.observe(this) { scanning ->
            scanButton.text = if (scanning)
                getString(R.string.stop_scan)
            else
                getString(R.string.scan_ble)
        }

        viewModel.bleDeviceList.observe(this) { devices ->
            deviceAdapter.clear()
            deviceAddressMap.clear()
            devices.forEachIndexed { index, device ->
                val label = buildString {
                    if (hasConnectPermission()) {
                        append(device.name ?: "Unknown")
                    } else {
                        append("Device")
                    }
                    append(" (${device.address})")
                }
                deviceAdapter.add(label)
                deviceAddressMap[index] = device
            }
            deviceAdapter.notifyDataSetChanged()
        }

        viewModel.ledState.observe(this) { on ->
            syncSwitch(ledToggle, on)
            syncSwitch(wifiLedToggle, on)
        }

        viewModel.relayStates.observe(this) { states ->
            if (states.size >= 4) {
                syncSwitch(relay1Toggle, states[0])
                syncSwitch(relay2Toggle, states[1])
                syncSwitch(relay3Toggle, states[2])
                syncSwitch(relay4Toggle, states[3])
                syncSwitch(wifiRelay1Toggle, states[0])
                syncSwitch(wifiRelay2Toggle, states[1])
                syncSwitch(wifiRelay3Toggle, states[2])
                syncSwitch(wifiRelay4Toggle, states[3])
            }
        }

        viewModel.wifiStatus.observe(this) { status ->
            statusText.text = status
        }

        viewModel.logMessages.observe(this) { messages ->
            logOutput.text = messages.joinToString("\n")
        }

        viewModel.esp32IpAddress.observe(this) { ip ->
            if (ipInput.text.toString() != ip) {
                ipInput.setText(ip)
            }
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /** Updates a Switch without triggering its listener. */
    private fun syncSwitch(switch: Switch, state: Boolean) {
        if (switch.isChecked != state) {
            isSyncingUi = true
            switch.isChecked = state
            isSyncingUi = false
        }
    }

    private fun requestBlePermissionsAndScan() {
        val required = buildList {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                add(Manifest.permission.BLUETOOTH_SCAN)
                add(Manifest.permission.BLUETOOTH_CONNECT)
            } else {
                add(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }

        val missing = required.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isEmpty()) {
            viewModel.startBleScan()
        } else {
            permissionLauncher.launch(missing.toTypedArray())
        }
    }

    private fun hasConnectPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(
                this, Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }
}
