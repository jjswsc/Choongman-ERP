package com.choongman.erp.pos;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Android POS 무음 인쇄: HTML → 비트맵 → ESC/POS 래스터 → LAN·블루투스·USB.
 * 프린터 매핑은 기기 로컬(SharedPreferences)에 JSON 문자열로 저장 — 해석은 웹(lib/android-thermal-printer.ts).
 */
@CapacitorPlugin(
    name = "CmThermalPrinter",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth")
    }
)
public class CmThermalPrinterPlugin extends Plugin {
    private static final String PREFS = "cm_thermal_printer";
    private static final String KEY_CONFIG = "config_json";
    private static final long RENDER_TIMEOUT_MS = 20000;

    private final ExecutorService io = Executors.newCachedThreadPool();
    /** 숨김 WebView는 한 번에 하나만 (메모리·메인 스레드 부하). */
    private final Semaphore renderGate = new Semaphore(1);
    /** 같은 프린터로 동시에 두 작업이 들어가면 출력이 섞인다. */
    private final ConcurrentHashMap<String, Object> targetLocks = new ConcurrentHashMap<>();

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private Object lockFor(JSObject target) {
        return targetLocks.computeIfAbsent(ThermalTransport.targetKey(target), k -> new Object());
    }

    private static JSObject failure(String reason) {
        JSObject ret = new JSObject();
        ret.put("ok", false);
        ret.put("reason", reason);
        return ret;
    }

    private boolean needsBluetoothRuntimePermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    @PluginMethod
    public void getConfig(PluginCall call) {
        JSObject ret = new JSObject();
        String json = prefs().getString(KEY_CONFIG, null);
        ret.put("json", json == null ? "" : json);
        call.resolve(ret);
    }

    @PluginMethod
    public void saveConfig(PluginCall call) {
        String json = call.getString("json", "");
        boolean ok = prefs().edit().putString(KEY_CONFIG, json == null ? "" : json).commit();
        JSObject ret = new JSObject();
        ret.put("ok", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void listBluetoothPrinters(PluginCall call) {
        if (needsBluetoothRuntimePermission()) {
            requestPermissionForAlias("bluetooth", call, "bluetoothListPermsCallback");
            return;
        }
        resolveBluetoothList(call);
    }

    @PermissionCallback
    private void bluetoothListPermsCallback(PluginCall call) {
        if (needsBluetoothRuntimePermission()) {
            JSObject ret = failure("bluetooth_permission");
            ret.put("devices", new JSArray());
            call.resolve(ret);
            return;
        }
        resolveBluetoothList(call);
    }

    private void resolveBluetoothList(PluginCall call) {
        JSArray devices = new JSArray();
        JSObject ret = new JSObject();
        try {
            BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter adapter = bm != null ? bm.getAdapter() : null;
            if (adapter == null) {
                ret.put("ok", false);
                ret.put("reason", "bluetooth_unavailable");
            } else if (!adapter.isEnabled()) {
                ret.put("ok", false);
                ret.put("reason", "bluetooth_off");
            } else {
                for (BluetoothDevice d : adapter.getBondedDevices()) {
                    JSObject row = new JSObject();
                    row.put("address", d.getAddress());
                    String name = d.getName();
                    row.put("name", name == null ? d.getAddress() : name);
                    devices.put(row);
                }
                ret.put("ok", true);
            }
        } catch (SecurityException e) {
            ret.put("ok", false);
            ret.put("reason", "bluetooth_permission");
        }
        ret.put("devices", devices);
        call.resolve(ret);
    }

    @PluginMethod
    public void listUsbPrinters(PluginCall call) {
        JSArray devices = new JSArray();
        UsbManager um = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        if (um != null) {
            for (UsbDevice d : um.getDeviceList().values()) {
                if (ThermalTransport.findPrinterInterface(d) == null) continue;
                JSObject row = new JSObject();
                row.put("vendorId", d.getVendorId());
                row.put("productId", d.getProductId());
                String name = null;
                try {
                    name = d.getProductName();
                } catch (SecurityException ignored) {
                    name = null;
                }
                row.put("name", name == null || name.isEmpty()
                    ? String.format("USB %04X:%04X", d.getVendorId(), d.getProductId())
                    : name);
                row.put("hasPermission", um.hasPermission(d));
                devices.put(row);
            }
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("devices", devices);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestUsbPermission(final PluginCall call) {
        final Context ctx = getContext();
        final UsbManager um = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
        UsbDevice device = ThermalTransport.findUsbDevice(um, call.getInt("vendorId", 0), call.getInt("productId", 0));
        if (device == null) {
            JSObject ret = failure("usb_not_found");
            ret.put("granted", false);
            call.resolve(ret);
            return;
        }
        if (um.hasPermission(device)) {
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        final String action = ctx.getPackageName() + ".CM_THERMAL_USB_PERMISSION";
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                try {
                    ctx.unregisterReceiver(this);
                } catch (Exception ignored) {
                    // ignore
                }
                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("granted", granted);
                call.resolve(ret);
            }
        };
        ContextCompat.registerReceiver(ctx, receiver, new IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED);
        Intent intent = new Intent(action).setPackage(ctx.getPackageName());
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        um.requestPermission(device, PendingIntent.getBroadcast(ctx, 0, intent, flags));
    }

    /**
     * { html, baseUrl, target, paperWidthMm=80, cropWidthDots=576, printWidthDots=576, leftOffsetDots=16,
     *   cut=true, kickDrawer=false, settleMs=250 } → { ok, reason?, usedDevice? }
     */
    @PluginMethod
    public void printHtml(final PluginCall call) {
        final String html = call.getString("html", "");
        final JSObject target = call.getObject("target");
        if (html == null || html.trim().isEmpty()) {
            call.resolve(failure("empty_html"));
            return;
        }
        if (target == null) {
            call.resolve(failure("no_target"));
            return;
        }
        if ("bluetooth".equals(target.getString("type")) && needsBluetoothRuntimePermission()) {
            call.resolve(failure("bluetooth_permission"));
            return;
        }
        final String baseUrl = call.getString("baseUrl", null);
        final int paperWidthMm = clamp(call.getInt("paperWidthMm", 80), 40, 120);
        final int cropWidthDots = clamp(call.getInt("cropWidthDots", 576), 64, 960);
        final int printWidthDots = clamp(call.getInt("printWidthDots", 576), 64, 960);
        final int leftOffsetDots = clamp(call.getInt("leftOffsetDots", 16), 0, 320);
        final boolean cut = Boolean.TRUE.equals(call.getBoolean("cut", true));
        final boolean kickDrawer = Boolean.TRUE.equals(call.getBoolean("kickDrawer", false));
        final long settleMs = clamp(call.getInt("settleMs", 250), 0, 5000);

        io.execute(() -> {
            Bitmap page;
            try {
                page = renderBlocking(html, baseUrl, paperWidthMm, settleMs);
            } catch (RenderException e) {
                call.resolve(failure(e.getMessage()));
                return;
            }
            byte[] data;
            try {
                Bitmap fitted = EscPosRaster.fitToPrintHead(page, leftOffsetDots, cropWidthDots, printWidthDots);
                page.recycle();
                data = EscPosRaster.build(fitted, cut, kickDrawer);
                fitted.recycle();
            } catch (OutOfMemoryError e) {
                call.resolve(failure("out_of_memory"));
                return;
            }
            if (data == null) {
                call.resolve(failure("render_blank"));
                return;
            }
            sendAndResolve(call, target, data);
        });
    }

    @PluginMethod
    public void openCashDrawer(final PluginCall call) {
        final JSObject target = call.getObject("target");
        if (target == null) {
            call.resolve(failure("no_printer"));
            return;
        }
        io.execute(() -> sendAndResolve(call, target, EscPosRaster.DRAWER_KICK));
    }

    private void sendAndResolve(PluginCall call, JSObject target, byte[] data) {
        try {
            synchronized (lockFor(target)) {
                ThermalTransport.send(getContext(), target, data);
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("usedDevice", ThermalTransport.targetKey(target));
            call.resolve(ret);
        } catch (ThermalTransport.TransportException e) {
            call.resolve(failure(e.reason));
        } catch (Exception e) {
            call.resolve(failure("send_failed:" + e.getClass().getSimpleName()));
        }
    }

    private static final class RenderException extends Exception {
        RenderException(String reason) {
            super(reason);
        }
    }

    private Bitmap renderBlocking(final String html, final String baseUrl, final int paperWidthMm, final long settleMs)
        throws RenderException {
        final Activity activity = getActivity();
        if (activity == null) throw new RenderException("no_activity");
        try {
            renderGate.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RenderException("interrupted");
        }
        try {
            final CountDownLatch latch = new CountDownLatch(1);
            final AtomicReference<Bitmap> result = new AtomicReference<>();
            final AtomicReference<String> error = new AtomicReference<>();
            activity.runOnUiThread(() -> {
                try {
                    ThermalHtmlRenderer.render(activity, html, baseUrl, paperWidthMm, settleMs, RENDER_TIMEOUT_MS,
                        new ThermalHtmlRenderer.Callback() {
                            @Override
                            public void onRendered(Bitmap page) {
                                result.set(page);
                                latch.countDown();
                            }

                            @Override
                            public void onError(String reason) {
                                error.set(reason);
                                latch.countDown();
                            }
                        });
                } catch (Throwable t) {
                    error.set("render_failed:" + t.getClass().getSimpleName());
                    latch.countDown();
                }
            });
            if (!latch.await(RENDER_TIMEOUT_MS + 5000, TimeUnit.MILLISECONDS)) {
                throw new RenderException("render_timeout");
            }
            Bitmap page = result.get();
            if (page == null) throw new RenderException(error.get() == null ? "render_failed" : error.get());
            return page;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RenderException("interrupted");
        } finally {
            renderGate.release();
        }
    }

    private static int clamp(Integer v, int min, int max) {
        int x = v == null ? min : v;
        return Math.max(min, Math.min(max, x));
    }
}
