package com.esp32controller

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

class WifiController(private var ipAddress: String = "") {

    companion object {
        private const val TAG = "WifiController"
        private const val PORT = 80
        private const val CONNECT_TIMEOUT_SEC = 10L
        private const val READ_TIMEOUT_SEC = 15L
        private const val WRITE_TIMEOUT_SEC = 15L
    }

    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(CONNECT_TIMEOUT_SEC, TimeUnit.SECONDS)
        .readTimeout(READ_TIMEOUT_SEC, TimeUnit.SECONDS)
        .writeTimeout(WRITE_TIMEOUT_SEC, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val baseUrl: String
        get() = "http://$ipAddress:$PORT"

    fun updateIpAddress(ip: String) {
        ipAddress = ip.trim()
        Log.d(TAG, "IP address updated to: $ipAddress")
    }

    fun hasValidIpAddress(): Boolean = ipAddress.isNotBlank()

    /**
     * Sends a GET request to the ESP32 with the given command and value parameters.
     * Example: sendCommand("led", "on") -> GET /led?value=on
     */
    suspend fun sendCommand(cmd: String, value: String): Result<String> = withContext(Dispatchers.IO) {
        if (!hasValidIpAddress()) {
            return@withContext Result.failure(IllegalStateException("IP address not configured"))
        }
        val url = "$baseUrl/$cmd?value=$value"
        executeGet(url)
    }

    /**
     * Fetches the current status of the ESP32 device.
     * Returns a JSON string with LED and relay states.
     */
    suspend fun getStatus(): Result<String> = withContext(Dispatchers.IO) {
        if (!hasValidIpAddress()) {
            return@withContext Result.failure(IllegalStateException("IP address not configured"))
        }
        val url = "$baseUrl/status"
        executeGet(url)
    }

    /**
     * Sets the onboard LED state on the ESP32.
     */
    suspend fun setLed(state: Boolean): Result<String> = withContext(Dispatchers.IO) {
        if (!hasValidIpAddress()) {
            return@withContext Result.failure(IllegalStateException("IP address not configured"))
        }
        val value = if (state) "on" else "off"
        val url = "$baseUrl/led?value=$value"
        Log.d(TAG, "Setting LED: $value -> $url")
        executeGet(url)
    }

    /**
     * Sets a relay channel state on the ESP32.
     * @param channel Relay channel number (1-4)
     * @param state   true = ON, false = OFF
     */
    suspend fun setRelay(channel: Int, state: Boolean): Result<String> = withContext(Dispatchers.IO) {
        if (!hasValidIpAddress()) {
            return@withContext Result.failure(IllegalStateException("IP address not configured"))
        }
        if (channel !in 1..4) {
            return@withContext Result.failure(IllegalArgumentException("Relay channel must be between 1 and 4"))
        }
        val value = if (state) "on" else "off"
        val url = "$baseUrl/relay?ch=$channel&value=$value"
        Log.d(TAG, "Setting relay $channel: $value -> $url")
        executeGet(url)
    }

    /**
     * Sends a raw GET request to a custom endpoint.
     */
    suspend fun sendRawCommand(endpoint: String): Result<String> = withContext(Dispatchers.IO) {
        if (!hasValidIpAddress()) {
            return@withContext Result.failure(IllegalStateException("IP address not configured"))
        }
        val url = "$baseUrl/$endpoint"
        executeGet(url)
    }

    private fun executeGet(url: String): Result<String> {
        return try {
            Log.d(TAG, "GET $url")
            val request = Request.Builder()
                .url(url)
                .get()
                .header("Accept", "application/json, text/plain, */*")
                .build()

            val response: Response = httpClient.newCall(request).execute()
            val body = response.body?.string() ?: ""

            if (response.isSuccessful) {
                Log.d(TAG, "Response [${response.code}]: $body")
                Result.success(body)
            } else {
                val errorMsg = "HTTP error ${response.code}: $body"
                Log.w(TAG, errorMsg)
                Result.failure(IOException(errorMsg))
            }
        } catch (e: IOException) {
            Log.e(TAG, "Network error: ${e.message}", e)
            Result.failure(IOException("Network error: ${e.message}"))
        } catch (e: IllegalArgumentException) {
            Log.e(TAG, "Invalid URL: $url - ${e.message}", e)
            Result.failure(IllegalArgumentException("Invalid URL or IP address"))
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error: ${e.message}", e)
            Result.failure(Exception("Unexpected error: ${e.message}"))
        }
    }

    fun shutdown() {
        httpClient.dispatcher.executorService.shutdown()
        httpClient.connectionPool.evictAll()
        Log.d(TAG, "OkHttpClient shut down")
    }
}
