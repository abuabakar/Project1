const FETCH_TIMEOUT_MS = 5000;

interface StatusResponse {
  led: boolean;
  relays: boolean[];
}

// Raw shape returned by the ESP32 firmware
interface RawStatusResponse {
  led: 0 | 1;
  relay: [0 | 1, 0 | 1, 0 | 1, 0 | 1];
}

class WifiService {
  private baseUrl: string = '';

  /**
   * Sets the ESP32 IP address used for all subsequent requests.
   */
  setIpAddress(ip: string): void {
    this.baseUrl = `http://${ip}`;
  }

  /**
   * Fetches the current device status from the ESP32.
   * Parses the firmware JSON shape: { led: 0|1, relay: [0,0,0,0] }
   */
  async getStatus(): Promise<StatusResponse> {
    const raw = await this.sendRawCommand('/status');
    let parsed: RawStatusResponse;

    try {
      parsed = JSON.parse(raw) as RawStatusResponse;
    } catch {
      throw new Error(`Failed to parse status response: ${raw}`);
    }

    if (typeof parsed.led === 'undefined' || !Array.isArray(parsed.relay)) {
      throw new Error(`Unexpected status format: ${raw}`);
    }

    return {
      led: parsed.led === 1,
      relays: parsed.relay.map((v) => v === 1),
    };
  }

  /**
   * Turns the onboard LED on or off.
   */
  async setLed(on: boolean): Promise<void> {
    const value = on ? 'on' : 'off';
    await this.sendRawCommand(`/led?value=${value}`);
  }

  /**
   * Controls a relay channel (0-based index maps to ch=1–4 on the firmware).
   */
  async setRelay(channel: number, on: boolean): Promise<void> {
    if (channel < 0 || channel > 3) {
      throw new Error(`Invalid relay channel: ${channel}. Must be 0–3.`);
    }
    const ch = channel + 1; // firmware uses 1-based channel numbers
    const value = on ? 'on' : 'off';
    await this.sendRawCommand(`/relay?ch=${ch}&value=${value}`);
  }

  /**
   * Raw HTTP GET helper. Applies a 5-second timeout via AbortController.
   * Returns the response body as a string.
   */
  async sendRawCommand(path: string): Promise<string> {
    if (!this.baseUrl) {
      throw new Error('No IP address set. Call setIpAddress() first.');
    }

    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${response.statusText} — ${url}`,
        );
      }

      return await response.text();
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          throw new Error(
            `Request timed out after ${FETCH_TIMEOUT_MS}ms — is the ESP32 reachable at ${this.baseUrl}?`,
          );
        }
        throw new Error(`Network error: ${err.message}`);
      }
      throw new Error('Unknown network error');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Attempts to reach the ESP32 by fetching its status endpoint.
   * Returns true on success, false on any error.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getStatus();
      return true;
    } catch {
      return false;
    }
  }
}

// Export as singleton
export const wifiService = new WifiService();
