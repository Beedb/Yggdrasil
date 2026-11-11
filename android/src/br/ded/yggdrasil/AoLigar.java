package br.ded.yggdrasil;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Celular ligou (ou o app foi atualizado): volta a agendar a verificação e os alarmes. */
public class AoLigar extends BroadcastReceiver {
    @Override
    public void onReceive(final Context c, Intent i) {
        Avisos.agendar(c);
        Avisos.prefs(c).edit().remove("alarmes").apply();
        final PendingResult pr = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    Avisos.verificar(c);
                } finally {
                    pr.finish();
                }
            }
        }).start();
    }
}
