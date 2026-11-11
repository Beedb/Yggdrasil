package br.ded.yggdrasil;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Tudo o que roda em segundo plano: pergunta ao servidor o que há de novo e avisa. */
final class Avisos {
    static final int JOB = 1;
    static final int ID_EMAIL = 1001;
    static final int ID_COMPILADO = 1002;
    static final int ID_PROBLEMA = 1003;
    static final int COR = 0xFFD9834B;
    private static final Object TRAVA = new Object();

    private Avisos() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("ygg", Context.MODE_PRIVATE);
    }

    static String url(Context c) {
        return prefs(c).getString("url", "");
    }

    /** "192.168.0.10" -> "http://192.168.0.10:8090/" */
    static String normalizar(String s) {
        s = s.trim();
        if (s.isEmpty()) return "";
        if (!s.matches("(?i)^https?://.*")) s = "http://" + s;
        Uri u = Uri.parse(s);
        String host = u.getHost();
        if (host == null || host.isEmpty()) return "";
        int porta = u.getPort() > 0 ? u.getPort() : 8090;
        return u.getScheme().toLowerCase(Locale.ROOT) + "://" + host + ":" + porta + "/";
    }

    // ---------------- agendamento ----------------

    static void agendar(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB) return;
        JobInfo info = new JobInfo.Builder(JOB, new ComponentName(c, Verificador.class))
                .setPeriodic(15 * 60 * 1000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build();
        js.schedule(info);
    }

    // ---------------- canais e notificações ----------------

    static void canais(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        String[][] lista = {
                {"agenda", "Compromissos", "4"},
                {"email", "Emails novos", "3"},
                {"compilado", "Compilado das newsletters", "3"},
                {"problema", "Problemas de conexão", "2"},
        };
        try {
            Class<?> k = Class.forName("android.app.NotificationChannel");
            for (String[] l : lista) {
                Object canal = k.getConstructor(String.class, CharSequence.class, int.class)
                        .newInstance(l[0], l[1], Integer.parseInt(l[2]));
                nm.getClass().getMethod("createNotificationChannel", k).invoke(nm, canal);
            }
        } catch (Exception e) {
            // sem canais: o Android usa o canal padrão
        }
    }

    private static Notification.Builder builder(Context c, String canal) {
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                return Notification.Builder.class.getConstructor(Context.class, String.class).newInstance(c, canal);
            } catch (Exception e) {
                // cai no construtor antigo
            }
        }
        Notification.Builder b = new Notification.Builder(c);
        b.setDefaults(Notification.DEFAULT_ALL);
        b.setPriority("agenda".equals(canal) ? Notification.PRIORITY_HIGH : Notification.PRIORITY_DEFAULT);
        return b;
    }

    static PendingIntent abrir(Context c, String hash, int pedido) {
        Intent i = new Intent(c, MainActivity.class);
        i.setAction("ygg.abrir." + pedido);
        i.putExtra("hash", hash);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, pedido, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void notificar(Context c, int id, String canal, String titulo, String texto, String hash, Notification.Style estilo) {
        canais(c);
        Notification.Builder b = builder(c, canal)
                .setSmallIcon(R.drawable.notif)
                .setColor(COR)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setAutoCancel(true)
                .setShowWhen(true)
                .setContentIntent(abrir(c, hash, id));
        b.setStyle(estilo != null ? estilo : new Notification.BigTextStyle().bigText(texto));
        if ("email".equals(canal)) b.setCategory(Notification.CATEGORY_EMAIL);
        if ("agenda".equals(canal)) b.setCategory(Notification.CATEGORY_EVENT);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        try {
            nm.notify(id, b.build());
        } catch (SecurityException e) {
            // notificações bloqueadas pelo usuário
        }
    }

    static void avisarEvento(Context c, String chave, String titulo, String local, long inicio) {
        SharedPreferences p = prefs(c);
        Set<String> avisados = new HashSet<>(p.getStringSet("eventosAvisados", new HashSet<String>()));
        if (avisados.contains(chave)) return;
        avisados.add(chave);
        p.edit().putStringSet("eventosAvisados", avisados).apply();
        String hora = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(inicio));
        long min = Math.max(0, Math.round((inicio - System.currentTimeMillis()) / 60000.0));
        String texto = (min > 0 ? "Daqui a " + min + " min, às " + hora : "Agora, às " + hora) + (local.isEmpty() ? "" : " · " + local);
        notificar(c, 2000 + (chave.hashCode() & 0xFFFF), "agenda", titulo, texto, "#agenda", null);
    }

    // ---------------- conversa com o servidor ----------------

    static String buscar(Context c, String caminho) throws Exception {
        SharedPreferences p = prefs(c);
        HttpURLConnection con = (HttpURLConnection) new URL(url(c) + caminho).openConnection();
        con.setConnectTimeout(8000);
        con.setReadTimeout(25000);
        con.setRequestProperty("X-Yggdrasil-Perfil", p.getString("perfil", "principal"));
        String pin = p.getString("pin", "");
        if (!pin.isEmpty()) con.setRequestProperty("X-Yggdrasil-Pin", pin);
        try {
            int st = con.getResponseCode();
            if (st == 401) throw new IllegalStateException("pin");
            if (st != 200) throw new IllegalStateException("http " + st);
            InputStream in = con.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } finally {
            con.disconnect();
        }
    }

    private static String hora() {
        return new SimpleDateFormat("dd/MM HH:mm", Locale.getDefault()).format(new Date());
    }

    /** Pergunta ao servidor e avisa o que for novo. Pode demorar: nunca chame na tela principal. */
    static void verificar(Context c) {
        synchronized (TRAVA) {
            if (url(c).isEmpty()) return;
            SharedPreferences p = prefs(c);
            JSONObject r;
            try {
                r = new JSONObject(buscar(c, "api/notificacoes"));
            } catch (IllegalStateException e) {
                if ("pin".equals(e.getMessage())) {
                    p.edit().putString("status", hora() + ": o servidor recusou o perfil ou o PIN").apply();
                    if (!p.getBoolean("avisouPin", false)) {
                        p.edit().putBoolean("avisouPin", true).apply();
                        notificar(c, ID_PROBLEMA, "problema", "Yggdrasil", "Abra o app e entre no seu perfil de novo para voltar a receber avisos.", "#inicio", null);
                    }
                } else {
                    p.edit().putString("status", hora() + ": " + e.getMessage()).apply();
                }
                return;
            } catch (Exception e) {
                p.edit().putString("status", hora() + ": servidor fora de alcance (fora de casa ou PC desligado)").apply();
                return;
            }
            p.edit().putBoolean("avisouPin", false).apply();
            long agora = System.currentTimeMillis();
            StringBuilder status = new StringBuilder(hora() + ": ok");
            try {
                eventos(c, r.optJSONArray("eventos"), r.optInt("avisoMin", 10), agora);
            } catch (Exception e) {
                status.append(" · erro nos eventos");
            }
            try {
                if (r.isNull("emails")) {
                    String erro = r.optString("emailErro", "");
                    if ("email-so-local".equals(erro)) status.append(" · emails: o perfil precisa de PIN para o email abrir pela rede");
                    else if ("sem-login".equals(erro)) status.append(" · emails: nenhuma conta conectada");
                    else if (!erro.isEmpty()) status.append(" · emails: ").append(erro);
                } else {
                    emails(c, r.getJSONArray("emails"));
                }
            } catch (Exception e) {
                status.append(" · erro nos emails");
            }
            try {
                compilado(c, r.optJSONObject("compilado"));
            } catch (Exception e) {
                status.append(" · erro no compilado");
            }
            p.edit().putString("status", status.toString()).apply();
        }
    }

    private static void eventos(Context c, JSONArray lista, int avisoMin, long agora) throws Exception {
        if (lista == null) return;
        SharedPreferences p = prefs(c);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Set<String> antes = new HashSet<>(p.getStringSet("alarmes", new HashSet<String>()));
        Set<String> agoraSet = new HashSet<>();
        Set<String> avisados = p.getStringSet("eventosAvisados", new HashSet<String>());
        for (int i = 0; i < lista.length(); i++) {
            JSONObject e = lista.getJSONObject(i);
            String chave = e.getString("chave");
            long inicio = e.getLong("inicio");
            long quando = inicio - avisoMin * 60000L;
            String titulo = e.optString("titulo", "Compromisso");
            String local = e.optString("local", "");
            if (avisados.contains(chave)) continue;
            if (quando <= agora) {
                if (inicio >= agora - 60000) avisarEvento(c, chave, titulo, local, inicio);
                continue;
            }
            String marca = chave + "@" + quando;
            agoraSet.add(marca);
            PendingIntent pi = Alarme.intencao(c, chave, titulo, local, inicio, PendingIntent.FLAG_UPDATE_CURRENT);
            if (podeExato(am)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, pi);
        }
        // Eventos apagados ou mudados de hora: cancela o alarme velho
        for (String marca : antes) {
            if (agoraSet.contains(marca)) continue;
            String chave = marca.substring(0, marca.lastIndexOf('@'));
            boolean aindaExiste = false;
            for (String m : agoraSet) if (m.startsWith(chave + "@")) aindaExiste = true;
            if (aindaExiste) continue;
            PendingIntent velho = Alarme.intencao(c, chave, "", "", 0, PendingIntent.FLAG_NO_CREATE);
            if (velho != null) {
                am.cancel(velho);
                velho.cancel();
            }
        }
        // Não deixa a lista de avisados crescer para sempre
        Set<String> limpos = new HashSet<>();
        for (String a : p.getStringSet("eventosAvisados", new HashSet<String>())) {
            for (int i = 0; i < lista.length(); i++) if (lista.getJSONObject(i).getString("chave").equals(a)) limpos.add(a);
        }
        p.edit().putStringSet("alarmes", agoraSet).putStringSet("eventosAvisados", limpos).apply();
    }

    private static boolean podeExato(AlarmManager am) {
        if (Build.VERSION.SDK_INT < 31) return true;
        try {
            return (Boolean) AlarmManager.class.getMethod("canScheduleExactAlarms").invoke(am);
        } catch (Exception e) {
            return false;
        }
    }

    private static void emails(Context c, JSONArray lista) throws Exception {
        SharedPreferences p = prefs(c);
        boolean primeira = !p.getBoolean("emailsBase", false);
        Set<String> vistos = p.getStringSet("emailsVistos", new HashSet<String>());
        Set<String> atuais = new HashSet<>();
        List<JSONObject> novos = new ArrayList<>();
        for (int i = 0; i < lista.length(); i++) {
            JSONObject m = lista.getJSONObject(i);
            String chave = m.getString("chave");
            atuais.add(chave);
            if (!primeira && !vistos.contains(chave)) novos.add(m);
        }
        p.edit().putStringSet("emailsVistos", atuais).putBoolean("emailsBase", true).apply();
        if (novos.isEmpty()) return;
        if (novos.size() == 1) {
            JSONObject m = novos.get(0);
            String previa = m.optString("previa", "");
            notificar(c, ID_EMAIL, "email", m.optString("de", "Email novo"), m.optString("assunto", ""),
                    "#email", new Notification.BigTextStyle().bigText(m.optString("assunto", "") + (previa.isEmpty() ? "" : "\n" + previa)));
            return;
        }
        Notification.InboxStyle estilo = new Notification.InboxStyle();
        for (int i = 0; i < Math.min(6, novos.size()); i++) {
            JSONObject m = novos.get(i);
            estilo.addLine(m.optString("de", "") + ": " + m.optString("assunto", ""));
        }
        if (novos.size() > 6) estilo.setSummaryText("+" + (novos.size() - 6));
        notificar(c, ID_EMAIL, "email", novos.size() + " emails novos",
                novos.get(0).optString("de", "") + ": " + novos.get(0).optString("assunto", ""), "#email", estilo);
    }

    private static void compilado(Context c, JSONObject comp) {
        if (comp == null) return;
        String chave = comp.optString("chave", "");
        if (chave.isEmpty()) return;
        SharedPreferences p = prefs(c);
        String visto = p.getString("compiladoVisto", null);
        p.edit().putString("compiladoVisto", chave).apply();
        if (visto == null || visto.equals(chave)) return;
        int n = comp.optInt("noticias", 0);
        notificar(c, ID_COMPILADO, "compilado", comp.optString("titulo", "Compilado das newsletters") + (n > 0 ? " · " + n + " notícias" : ""),
                comp.optString("manchete", "Pronto para ler"), "#email", null);
    }
}
