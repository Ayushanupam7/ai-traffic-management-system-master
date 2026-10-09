import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-[#070b12] text-slate-900 dark:text-gray-100">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 font-extrabold text-2xl flex items-center justify-center mb-4 border border-amber-500/20">
        404
      </div>
      <h1 className="text-xl font-bold tracking-tight mb-2">Page Not Found</h1>
      <p className="text-xs text-slate-500 dark:text-gray-400 max-w-sm mb-6">
        The traffic telemetry route or view you are looking for does not exist or has been relocated.
      </p>
      <Link
        href="/"
        className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/25 transition-all"
      >
        Return to Traffic Dashboard
      </Link>
    </div>
  );
}
