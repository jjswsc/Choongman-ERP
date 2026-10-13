package com.choongman.erp.pos;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.UUID;

/** ESC/POS 바이트를 LAN(9100) · 블루투스 SPP · USB 프린터로 전송. */
final class ThermalTransport {
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int TCP_CONNECT_TIMEOUT_MS = 4000;
    private static final int TCP_SO_TIMEOUT_MS = 10000;
    private static final int BT_CHUNK = 4096;
    private static final int USB_CHUNK = 16384;
    private static final int USB_TIMEOUT_MS = 5000;

    static final class TransportException extends Exception {
        final String reason;

        TransportException(String reason) {
            super(reason);
            this.reason = reason;
        }
    }

    private ThermalTransport() {}

    static String targetKey(JSONObject target) {
        String type = target.optString("type", "");
        switch (type) {
            case "tcp":
                return "tcp:" + target.optString("host", "") + ":" + target.optInt("port", 9100);
            case "bluetooth":
                return "bt:" + target.optString("address", "").toUpperCase();
            case "usb":
                return "usb:" + target.optInt("vendorId", 0) + ":" + target.optInt("productId", 0);
            default:
                return "unknown";
        }
    }

    static void send(Context ctx, JSONObject target, byte[] data) throws TransportException {
        String type = target.optString("type", "");
        switch (type) {
            case "tcp":
                sendTcp(target.optString("host", "").trim(), target.optInt("port", 9100), data);
                return;
            case "bluetooth":
                sendBluetooth(ctx, target.optString("address", "").trim(), data);
                return;
            case "usb":
                sendUsb(ctx, target.optInt("vendorId", 0), target.optInt("productId", 0), data);
                return;
            default:
                throw new TransportException("unsupported_target");
        }
    }

    private static void sendTcp(String host, int port, byte[] data) throws TransportException {
        if (host.isEmpty()) throw new TransportException("tcp_host_missing");
        int p = port > 0 && port < 65536 ? port : 9100;
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, p), TCP_CONNECT_TIMEOUT_MS);
            socket.setSoTimeout(TCP_SO_TIMEOUT_MS);
            OutputStream os = socket.getOutputStream();
            os.write(data);
            os.flush();
            socket.shutdownOutput();
            sleepQuietly(150);
        } catch (java.net.SocketTimeoutException e) {
            throw new TransportException("tcp_timeout");
        } catch (IOException e) {
            throw new TransportException("tcp_failed:" + safeMessage(e));
        }
    }

    private static void sendBluetooth(Context ctx, String address, byte[] data) throws TransportException {
        if (address.isEmpty()) throw new TransportException("bluetooth_address_missing");
        BluetoothManager bm = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bm != null ? bm.getAdapter() : null;
        if (adapter == null) throw new TransportException("bluetooth_unavailable");
        BluetoothSocket socket = null;
        try {
            if (!adapter.isEnabled()) throw new TransportException("bluetooth_off");
            BluetoothDevice device = adapter.getRemoteDevice(address);
            try {
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();
            } catch (IOException first) {
                closeQuietly(socket);
                try {
                    socket = (BluetoothSocket) device.getClass()
                        .getMethod("createRfcommSocket", int.class)
                        .invoke(device, 1);
                    if (socket == null) throw first;
                    socket.connect();
                } catch (IOException second) {
                    throw new TransportException("bluetooth_connect_failed");
                } catch (ReflectiveOperationException reflect) {
                    throw new TransportException("bluetooth_connect_failed");
                }
            }
            OutputStream os = socket.getOutputStream();
            for (int off = 0; off < data.length; off += BT_CHUNK) {
                os.write(data, off, Math.min(BT_CHUNK, data.length - off));
            }
            os.flush();
            // SPP write는 스택 버퍼에 넣고 바로 반환 — 즉시 close하면 뒷부분이 잘린다(약 20KB/s 기준 대기).
            sleepQuietly(Math.min(15000, 400 + data.length / 20));
        } catch (SecurityException e) {
            throw new TransportException("bluetooth_permission");
        } catch (IllegalArgumentException e) {
            throw new TransportException("bluetooth_address_invalid");
        } catch (IOException e) {
            throw new TransportException("bluetooth_failed:" + safeMessage(e));
        } finally {
            closeQuietly(socket);
        }
    }

    static UsbDevice findUsbDevice(UsbManager um, int vendorId, int productId) {
        if (um == null) return null;
        for (UsbDevice d : um.getDeviceList().values()) {
            if (d.getVendorId() == vendorId && d.getProductId() == productId) return d;
        }
        return null;
    }

    /** 프린터 클래스(7) 우선, 없으면 bulk OUT 엔드포인트가 있는 첫 인터페이스. */
    static UsbInterface findPrinterInterface(UsbDevice device) {
        UsbInterface fallback = null;
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface intf = device.getInterface(i);
            if (findBulkOut(intf) == null) continue;
            if (intf.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return intf;
            if (fallback == null) fallback = intf;
        }
        return fallback;
    }

    static UsbEndpoint findBulkOut(UsbInterface intf) {
        for (int e = 0; e < intf.getEndpointCount(); e++) {
            UsbEndpoint ep = intf.getEndpoint(e);
            if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                return ep;
            }
        }
        return null;
    }

    private static void sendUsb(Context ctx, int vendorId, int productId, byte[] data) throws TransportException {
        UsbManager um = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
        UsbDevice device = findUsbDevice(um, vendorId, productId);
        if (device == null) throw new TransportException("usb_not_found");
        if (!um.hasPermission(device)) throw new TransportException("usb_permission_required");
        UsbInterface intf = findPrinterInterface(device);
        if (intf == null) throw new TransportException("usb_no_bulk_out");
        UsbEndpoint ep = findBulkOut(intf);
        UsbDeviceConnection conn = um.openDevice(device);
        if (conn == null) throw new TransportException("usb_open_failed");
        try {
            if (!conn.claimInterface(intf, true)) throw new TransportException("usb_claim_failed");
            for (int off = 0; off < data.length; off += USB_CHUNK) {
                int len = Math.min(USB_CHUNK, data.length - off);
                int n = conn.bulkTransfer(ep, data, off, len, USB_TIMEOUT_MS);
                if (n < 0) throw new TransportException("usb_write_failed");
            }
            conn.releaseInterface(intf);
        } finally {
            conn.close();
        }
    }

    private static void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void closeQuietly(BluetoothSocket socket) {
        if (socket == null) return;
        try {
            socket.close();
        } catch (IOException ignored) {
            // ignore
        }
    }

    private static String safeMessage(Exception e) {
        String m = e.getMessage();
        return m == null || m.isEmpty() ? e.getClass().getSimpleName() : m;
    }
}
