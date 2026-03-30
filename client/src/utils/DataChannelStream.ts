import { Duplex } from 'stream';

/**
 * Wraps an RTCDataChannel in a Node-compatible Duplex stream.
 */
export class DataChannelStream extends Duplex {
  private dc: RTCDataChannel;

  constructor(dc: RTCDataChannel) {
    super();
    this.dc = dc;

    this.dc.onmessage = (event) => {
      const data = event.data instanceof ArrayBuffer 
        ? Buffer.from(event.data) 
        : Buffer.from(event.data);
      
      if (!this.push(data)) {
        // Handle backpressure if needed (RTCDataChannel doesn't support pause/resume well)
      }
    };

    this.dc.onclose = () => {
      this.push(null);
    };

    this.dc.onerror = (err) => {
      this.destroy(err as any);
    };
  }

  _read() {
    // Data is pushed via onmessage
  }

  _write(chunk: any, _encoding: string, callback: (error?: Error | null) => void) {
    if (this.dc.readyState !== 'open') {
      return callback(new Error('DataChannel is not open'));
    }

    try {
      this.dc.send(chunk);
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  _destroy(err: Error | null, callback: (error: Error | null) => void) {
    if (this.dc.readyState === 'open' || this.dc.readyState === 'connecting') {
      this.dc.close();
    }
    callback(err);
  }
}
