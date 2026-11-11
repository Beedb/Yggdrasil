package br.ded.yggdrasil;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Roda a cada ~15 minutos, mesmo com o app fechado. */
public class Verificador extends JobService {
    @Override
    public boolean onStartJob(final JobParameters params) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                Avisos.verificar(Verificador.this);
                jobFinished(params, false);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
