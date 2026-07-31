# Live Telemetry

The One-Line **Live** button configures a browser-only, read-only telemetry adapter. Choose either HTTP polling or a WebSocket stream; both accept JSON such as:

```json
{ "readings": [{ "tag": "sub.bus.1", "values": { "kv": 13.8, "kw": 2450, "status": "closed" } }] }
```

Map each tag to a one-line component ID. HTTP polls at an explicit interval (minimum five seconds); WebSocket messages are applied as they arrive. Both keep a bounded in-memory trend history for each mapped component and display the most recent values in engineering datablocks. Set **Stale after** in the **Live** dialog to mark values whose source timestamp has aged past the selected threshold; its default is twice the polling interval, never less than 30 seconds. Configure optional engineering limits in **Alarm limits** using `component.metric=low..high` (for example, `BUS-1.kv=12.5..14.5` or `MTR-1.amps=..800`). Active low/high threshold conditions appear in component datablocks and in **View active alarms**; they are advisory, read-only indications. Open **Live**, then choose **View 24-hour trend** to select a mapped component and numeric metric and inspect its rolling plot with latest, minimum, average, and maximum values. Select **Export 24-hour CSV** to download the displayed metric's timestamped in-session readings. The telemetry values are not written into the electrical design model or used by studies.

Operator mode disables diagram-editing commands while live telemetry is active. HTTP endpoints must permit browser CORS access and WebSocket endpoints must accept the application origin; both must be read-only. WebSocket recovery is enabled by default and retries after 5 seconds, doubling up to a 60-second maximum; turn it off in **Live** when the site gateway owns reconnection. The 24-hour trend is an in-session operational aid, not a durable historian. Production SCADA authentication, network segmentation, historian retention, and operator authorization remain the responsibility of the telemetry platform and asset owner.
