package com.acsinformatica.gelato;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.IBinder;
import android.os.RemoteException;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.iposprinter.iposprinterservice.IPosPrinterCallback;
import com.iposprinter.iposprinterservice.IPosPrinterService;

import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "NaviaPrinter")
public class NaviaPrinterPlugin extends Plugin {
    private volatile IPosPrinterService printer;
    private boolean bound;
    private final AtomicBoolean printing = new AtomicBoolean(false);

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            printer = IPosPrinterService.Stub.asInterface(service);
            bound = true;
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            printer = null;
        }
    };

    @Override
    public void load() {
        Intent intent = new Intent("com.iposprinter.iposprinterservice.IPosPrintService");
        intent.setPackage("com.iposprinter.iposprinterservice");
        bound = getContext().bindService(intent, connection, Context.BIND_AUTO_CREATE);
    }

    @PluginMethod
    public void status(PluginCall call) {
        if (!bound || printer == null) {
            call.reject("Servico nativo da impressora indisponivel.");
            return;
        }
        try {
            JSObject result = new JSObject();
            result.put("status", printer.getPrinterStatus());
            call.resolve(result);
        } catch (RemoteException error) {
            call.reject("Falha ao consultar a impressora.", error);
        }
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (!bound || printer == null) {
            call.reject("Servico nativo da impressora indisponivel.");
            return;
        }

        String text = call.getString("text", "");
        String qrCode = call.getString("qrCode", "");
        String imageBase64 = call.getString("imageBase64", "");
        int feedLines = call.getInt("feedLines", 120);
        if (!printing.compareAndSet(false, true)) {
            call.reject("Aguarde a impressao em andamento.");
            return;
        }
        AtomicBoolean completed = new AtomicBoolean(false);
        IPosPrinterService service = printer;

        new Thread(() -> {
            try {
                int status = service.getPrinterStatus();
                if (status != 0) {
                    call.reject(printerStatusMessage(status));
                    return;
                }

                IPosPrinterCallback noOp = new IPosPrinterCallback.Stub() {
                    @Override public void onRunResult(boolean success) {}
                    @Override public void onReturnString(String result) {}
                };

                IPosPrinterCallback completedCallback = new IPosPrinterCallback.Stub() {
                    @Override
                    public void onRunResult(boolean success) {
                        if (!completed.compareAndSet(false, true)) return;
                        if (success) {
                            JSObject result = new JSObject();
                            result.put("printed", true);
                            call.resolve(result);
                        } else {
                            call.reject("A impressora recusou o comprovante.");
                        }
                    }

                    @Override public void onReturnString(String result) {}
                };

                printer.printerInit(noOp);
                printer.setPrinterPrintDepth(10, noOp);
                printer.setPrinterPrintAlignment(0, noOp);
                printer.printSpecifiedTypeText(text + "\n", "ST", 24, noOp);
                if (imageBase64 != null && !imageBase64.trim().isEmpty()) {
                    String encoded = imageBase64.contains(",") ? imageBase64.substring(imageBase64.indexOf(',') + 1) : imageBase64;
                    byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                    Bitmap signature = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (signature != null) {
                        int targetWidth = Math.min(360, signature.getWidth());
                        int targetHeight = Math.max(1, Math.round(signature.getHeight() * (targetWidth / (float) signature.getWidth())));
                        Bitmap scaled = Bitmap.createScaledBitmap(signature, targetWidth, targetHeight, true);
                        Bitmap monochrome = prepareSignatureBitmap(scaled);
                        if (monochrome != null) {
                            printer.setPrinterPrintAlignment(1, noOp);
                            printer.printBitmap(1, monochrome.getWidth(), monochrome, noOp);
                        }
                    }
                }
                if (qrCode != null && !qrCode.trim().isEmpty()) {
                    printer.setPrinterPrintAlignment(1, noOp);
                    printer.printQRCode(qrCode, 8, 2, noOp);
                }
                printer.printerPerformPrint(feedLines, completedCallback);
                // Alguns firmwares do VT-Q2i imprimem normalmente, mas nao
                // devolvem o callback final. A chamada Binder ter retornado
                // significa que o trabalho foi aceito pela fila da impressora.
                if (completed.compareAndSet(false, true)) {
                    JSObject result = new JSObject();
                    result.put("printed", false);
                    result.put("queued", true);
                    call.resolve(result);
                }
            } catch (Exception error) {
                if (completed.compareAndSet(false, true)) call.reject("Falha ao imprimir no VT-Q2i.", error);
            } finally {
                printing.set(false);
            }
        }, "navia-printer").start();
    }

    private Bitmap prepareSignatureBitmap(Bitmap source) {
        int width = source.getWidth();
        int height = source.getHeight();
        int[] pixels = new int[width * height];
        source.getPixels(pixels, 0, width, 0, 0, width, height);

        int minX = width;
        int minY = height;
        int maxX = -1;
        int maxY = -1;

        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int index = y * width + x;
                int color = pixels[index];
                int alpha = Color.alpha(color);
                int luminance = Math.round(Color.red(color) * 0.299f + Color.green(color) * 0.587f + Color.blue(color) * 0.114f);
                boolean ink = alpha > 48 && luminance < 190;
                pixels[index] = ink ? Color.BLACK : Color.WHITE;
                if (ink) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        if (maxX < minX || maxY < minY) return null;

        int padding = 10;
        int cropWidth = maxX - minX + 1;
        int cropHeight = maxY - minY + 1;
        int outputWidth = Math.min(360, cropWidth + padding * 2);
        int outputHeight = cropHeight + padding * 2;
        Bitmap output = Bitmap.createBitmap(outputWidth, outputHeight, Bitmap.Config.RGB_565);
        output.eraseColor(Color.WHITE);

        int destinationX = Math.max(0, (outputWidth - cropWidth) / 2);
        int[] cropped = new int[cropWidth * cropHeight];
        for (int y = 0; y < cropHeight; y++) {
            System.arraycopy(pixels, (minY + y) * width + minX, cropped, y * cropWidth, cropWidth);
        }
        output.setPixels(cropped, 0, cropWidth, destinationX, padding, cropWidth, cropHeight);
        return output;
    }

    private String printerStatusMessage(int status) {
        switch (status) {
            case 1: return "Impressora sem papel.";
            case 2: return "Cabeca termica superaquecida.";
            case 3: return "Motor da impressora superaquecido.";
            case 4: return "Impressora ocupada.";
            default: return "Impressora indisponivel (status " + status + ").";
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (bound) {
            getContext().unbindService(connection);
            bound = false;
        }
        super.handleOnDestroy();
    }
}

