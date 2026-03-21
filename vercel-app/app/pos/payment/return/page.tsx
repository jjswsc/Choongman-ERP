/**
 * POS용 KBank 스위치백 스텁.
 */
export default function PosPaymentReturnPage() {
  return (
    <main className="min-h-[40vh] flex flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">POS 결제</h1>
      <p className="text-sm text-muted-foreground max-w-md">
        결제 창에서 돌아온 페이지입니다. 연동 완료 후 결제 결과를 반영합니다.
      </p>
    </main>
  )
}
