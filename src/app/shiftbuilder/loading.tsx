/**
 * ShiftBuilder Loading Shell — Phase 0
 *
 * Beautiful instant skeleton that matches the Velvet / ZDS Golden artboard aesthetic.
 * Shown during the dynamic import of the 6k LOC client monolith (before virtualization).
 *
 * This alone makes the "Loading Shift Builder…" flash feel intentional and premium
 * instead of broken.
 */
export default function ShiftBuilderLoading() {
  return (
    <div className="min-h-screen bg-[#F8F8F9] dark:bg-[#111113] flex items-center justify-center p-8">
      <div className="w-full max-w-[1080px]">
        {/* Top chrome skeleton (matches FloatingNav + header) */}
        <div className="h-14 mb-4 rounded-xl bg-white/70 dark:bg-white/5 border border-black/5 dark:border-white/10 flex items-center px-6 gap-4">
          <div className="h-3 w-24 bg-black/10 dark:bg-white/10 rounded" />
          <div className="flex-1" />
          <div className="h-8 w-8 rounded-full bg-black/10 dark:bg-white/10" />
          <div className="h-8 w-8 rounded-full bg-black/10 dark:bg-white/10" />
        </div>

        {/* Main artboard skeleton — exact proportions of the Golden 1056×816 */}
        <div
          className="mx-auto rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#1C1C1E] shadow-xl overflow-hidden"
          style={{ width: "100%", maxWidth: 1056, aspectRatio: "1056 / 816" }}
        >
          {/* Header strip */}
          <div className="h-10 bg-[#111113] dark:bg-black/40 flex items-center px-4 gap-3">
            <div className="h-4 w-40 bg-white/20 rounded" />
            <div className="flex-1" />
            <div className="h-5 w-5 bg-white/20 rounded" />
            <div className="h-5 w-16 bg-white/10 rounded" />
          </div>

          {/* Grid of zone / RR cards — matches real layout density */}
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-xl border border-black/5 dark:border-white/10 bg-[#FAFAF8] dark:bg-[#161618] relative overflow-hidden"
              >
                {/* Colored top stripe (simulated) */}
                <div
                  className="h-3 w-full"
                  style={{ background: i % 3 === 0 ? "#B89708" : i % 3 === 1 ? "#E53935" : "#1976D2", opacity: 0.25 }}
                />
                <div className="p-3 space-y-2">
                  <div className="h-3 w-12 bg-black/10 dark:bg-white/10 rounded" />
                  <div className="h-4 w-3/4 bg-black/10 dark:bg-white/10 rounded" />
                  <div className="h-3 w-1/2 bg-black/5 dark:bg-white/5 rounded" />
                </div>
                {/* Subtle shimmer */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent animate-pulse" />
              </div>
            ))}
          </div>

          {/* Roster rail hint */}
          <div className="absolute bottom-6 right-6 hidden xl:block w-56 h-9 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5" />
        </div>

        <div className="text-center mt-4 text-[10px] tracking-[0.16em] text-[#8E8E93] dark:text-[#5A5A5E] font-mono">
          LOADING VELVET ENGINE • DRAFT MODE READY
        </div>
      </div>

    </div>
  );
}
