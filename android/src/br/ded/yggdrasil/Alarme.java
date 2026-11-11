package br.ded.yggdrasil;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

/** Dispara na hora de avisar um compromisso. */
public class Alarme extends BroadcastReceiver {
    static PendingIntent intencao(Context c, String chave, String titulo, String local, long inicio, int flags) {
        Intent i = new Intent(c, Alarme.class);
        i.setAction("ygg.evento");
        i.setData(Uri.parse("ygg://evento/" + Uri.encode(chave)));
        i.putExtra("chave", chave);
        i.putExtra("titulo", titulo);
        i.putExtra("local", local);
        i.putExtra("inicio", inicio);
        return PendingIntent.getBroadcast(c, 0, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        String chave = i.getStringExtra("chave");
        if (chave == null) return;
        Avisos.avisarEvento(c, chave, i.getStringExtra("titulo"), i.getStringExtra("local") == null ? "" : i.getStringExtra("local"),
                i.getLongExtra("inicio", System.currentTimeMillis()));
    }
}
