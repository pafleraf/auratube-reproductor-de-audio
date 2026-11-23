import React, { useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5 hover:bg-amber-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
        title="Instalar aplicación en pantalla de inicio"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Instalar App</span>
      </button>
    );
  }

  // Show iOS/Mobile install guide button so users on iOS Safari or mobile browsers can pin to home screen for optimal background audio
  return (
    <>
      <button
        onClick={() => setShowIOSGuide(true)}
        className="min-h-[44px] px-3 py-2 rounded-xl bg-[#12151E] border border-white/10 text-slate-200 hover:text-white hover:border-amber-500/40 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        title="Instalar en Android o iOS para reproducción en segundo plano"
      >
        <Download className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="hidden sm:inline">{isIOS ? 'Instalar en iOS' : 'Modo App'}</span>
      </button>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#12151E] border border-white/10 p-5 shadow-2xl text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-semibold font-display">
                Instalar AuraTube en tu dispositivo
              </h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
                aria-label="Cerrar guía"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p className="text-xs text-slate-400 leading-relaxed">
                Instalar la web como aplicación optimiza la persistencia del audio con la pantalla apagada y los controles en la barra de notificaciones:
              </p>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-[#090A0F] border border-white/5">
                <Share className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-200 text-xs">1. Abre el menú del navegador</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    En Chrome Android toca los tres puntos <strong>⋮</strong>; en Safari iOS toca <strong>Compartir</strong>.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-[#090A0F] border border-white/5">
                <PlusSquare className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-200 text-xs">2. Añadir a pantalla de inicio</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Selecciona <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};
