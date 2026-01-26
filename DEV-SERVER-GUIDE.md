# Expo Dev Server Guide

## Quick Start

### Start the server:
```bash
npm run dev-server
```

Or use the helper script:
```bash
./scripts/start-dev-server.sh
```

## Interactive Commands

While the server is running, press these keys:

| Key | Action |
|-----|--------|
| `i` | Open iOS simulator |
| `a` | Open Android emulator |
| `w` | Open in web browser |
| `r` | Reload the app |
| `m` | Toggle menu |
| `j` | Open debugger |
| `c` | Clear cache |
| `?` | Show all commands |
| `Ctrl+C` | Stop the server |

## What You'll See

1. **QR Code** - Scan with Expo Go app on your phone
2. **Metro Bundler** - JavaScript bundler logs
3. **Connection Info** - URLs for connecting devices

## Connecting Devices

### iOS Simulator
1. Press `i` in the terminal
2. Or run: `npm run ios` (requires CocoaPods)

### Android Emulator
1. Press `a` in the terminal
2. Or run: `npm run android` (requires Android Studio)

### Physical Device
1. Install **Expo Go** app from App Store/Play Store
2. Scan the QR code shown in terminal
3. Make sure your phone and computer are on the same network

## Troubleshooting

### Server won't start
- Check if port 8081 is already in use: `lsof -ti:8081`
- Kill existing process: `pkill -f "expo start"`

### Can't connect device
- Ensure phone and computer are on the same Wi-Fi network
- Check firewall settings
- Try using tunnel mode: `expo start --tunnel`

### Clear cache
- Press `c` while server is running
- Or: `expo start --clear`

## Monitoring

Check server status:
```bash
./scripts/monitor-dev-server.sh
```

Watch server continuously:
```bash
./scripts/watch-dev-server.sh
```

### View Connected Devices

See who is currently connected:
```bash
./scripts/show-connections.sh
```

Watch connections in real-time:
```bash
./scripts/watch-connections.sh
```

This will show:
- Active connections with IP addresses
- Connection statistics
- Listening ports
- Server network address
