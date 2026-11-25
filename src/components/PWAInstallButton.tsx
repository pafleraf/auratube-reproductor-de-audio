import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Share,
  PlusSquare,
  X,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!showGuide) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowGuide(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showGuide]);

  if (isInstalled) {
    return null;
  }

  const handleOpenModal = () => {
    setShowGuide(true);
  };

  const handleNativeInstall = async () => {
    try {
      const accepted = await install();
      if (accepted) {
        setShowGuide(false);
      }
    } catch {
      // Fallback: keep instructions visible
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpenModal}
        className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
          isInstallable
            ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-[0.98]'
            : 'bg-[#12151E] border border-white/15 text-slate-100 hover:text-white hover:border-amber-500/50'
        }`}
        title="Ver instrucciones o instalar Modo App en Android e iOS"
      >
        <Download
          className={`w-3.5 h-3.5 shrink-0 ${
            isInstallable ? 'text-slate-950' : 'text-amber-400'
          }`}
        />
        <span>{isIOS ? 'Modo App iOS' : 'Modo App'}</span>
      </button>

      {showGuide &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pwa-modal-backdrop fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setShowGuide(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-guide-title"
          >
            <div
              className="pwa-modal-card relative flex flex-col w-full rounded-2xl bg-[#12151E] border border-white/15 shadow-2xl text-slate-100 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Fixed Modal Header */}
              <div className="pwa-modal-header border-b border-white/10 flex items-center justify-between gap-2 shrink-0 bg-[#090A0F]/80">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4 text-amber-400" />
                  </div>
                  <h3
                    id="pwa-guide-title"
                    className="text-xs sm:text-sm font-bold font-display text-white truncate"
                  >
                    Instalar AuraTube (Modo App)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                  aria-label="Cerrar guía"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Responsive Scrollable Body (Adapts to Portrait & Short Landscape Viewports) */}
              <div className="pwa-modal-body custom-scroll flex-1 min-h-0 overflow-y-auto text-xs text-slate-300">
                <p className="text-[11px] sm:text-xs text-slate-300 leading-snug">
                  Instala la webapp en tu pantalla de inicio para mantener el{' '}
                  <strong className="text-amber-400 font-semibold">
                    audio activo en segundo plano con la pantalla apagada
                  </strong>{' '}
                  y controlar la reproducción desde la barra de notificaciones:
                </p>

                {isInstallable && (
                  <button
                    type="button"
                    onClick={handleNativeInstall}
                    className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Instalar aplicación directamente</span>
                  </button>
                )}

                {/* Orientation-Aware Steps Grid (1 column in narrow portrait, 2 columns in landscape & desktop) */}
                <div className="pwa-modal-steps-grid">
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090A0F] border border-white/10">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0 mt-0.5">
                      <Share className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-xs">
                        1. Menú del navegador
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        En <strong>Chrome (Android)</strong> toca{' '}
                        <strong className="text-slate-200">⋮</strong> arriba a la derecha. En{' '}
                        <strong>Safari (iOS)</strong> toca{' '}
                        <strong className="text-slate-200">Compartir</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090A0F] border border-white/10">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0 mt-0.5">
                      <PlusSquare className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-xs">
                        2. Añadir a inicio
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        Pulsa{' '}
                        <strong className="text-amber-300">Instalar aplicación</strong> o{' '}
                        <strong className="text-amber-300">
                          Añadir a pantalla de inicio
                        </strong>{' '}
                        y confirma.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="leading-tight">
                    Ábrela desde el nuevo icono en tu móvil para pantalla completa sin barras del navegador.
                  </span>
                </div>
              </div>

              {/* Fixed Modal Footer */}
              <div className="pwa-modal-footer border-t border-white/10 bg-[#090A0F]/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="w-full h-8 sm:h-9 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
