import React from "react";

interface LoadingScreenProps {
  message: string;
  submessage?: string;
  type?: "infinity" | "spinner";
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message,
  submessage,
  type = "spinner",
}) => (
  <div className="min-h-dvh bg-base-100 flex flex-col items-center justify-center relative px-6 py-12 overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-secondary/10 opacity-30 pointer-events-none"></div>
    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse"></div>
    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[120px] animate-pulse delay-700"></div>

    <div className="z-10 flex flex-col items-center animate-slide-up">
      <div className="loader-glow mb-12">
        <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl glass-panel flex items-center justify-center p-6 sm:p-8 transform hover:scale-105 transition-transform duration-500">
          <img
            src="/logo.svg"
            alt="Linda Logo"
            className="w-full h-full object-contain drop-shadow-2xl"
          />
        </div>
      </div>

      <div className="text-center space-y-6">
        <h1 className="text-4xl sm:text-5xl font-black text-primary tracking-tightest drop-shadow-sm">
          Linda
        </h1>

        <div className="flex flex-col items-center gap-6 px-10 py-8 glass-panel rounded-[2.5rem] border border-white/5 shadow-2xl min-w-[280px]">
          {type === "infinity" ? (
            <span className="loading loading-infinity loading-lg text-primary scale-150"></span>
          ) : (
            <span className="loading loading-spinner loading-lg text-primary scale-125"></span>
          )}
          <div className="space-y-1">
            <p className="text-xs font-black uppercase tracking-[0.4em] text-primary/80">
              {message}
            </p>
            {submessage && (
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">
                {submessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);
