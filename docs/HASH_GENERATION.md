# Script Integrity Hashes

This project uses Subresource Integrity (SRI) checks for external scripts.

To generate a SHA-384 hash for a script and add it to an HTML tag:

1. **Download and hash a remote script**
   ```bash
   curl -L <script-url> | openssl dgst -sha384 -binary | openssl base64 -A
   ```
   Replace `<script-url>` with the script's URL.

2. **Hash a local script**
   ```bash
   openssl dgst -sha384 -binary path/to/script.js | openssl base64 -A
   ```

3. Prefix the resulting string with `sha384-` and add it to the script tag:
   ```html
   <script src="..." integrity="sha384-<hash>" crossorigin="anonymous"></script>
   ```

When updating scripts, regenerate the hash and update the corresponding HTML tag.
