import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="glass-card max-w-md p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl">
          文
        </div>
        <h1 className="text-xl font-semibold text-white">오프라인 상태입니다</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          네트워크가 연결되면 확정본 리더와 용어사전을 다시 불러올 수 있습니다.
          이전에 열었던 일부 화면은 캐시에 남아 있을 수 있습니다.
        </p>
        <Link
          href="/reader/iphone"
          className="mt-6 inline-flex rounded-xl bg-emerald-600/80 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
        >
          리더로 돌아가기
        </Link>
      </div>
    </div>
  );
}
