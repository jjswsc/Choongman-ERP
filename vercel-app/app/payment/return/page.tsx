/**
 * KBank 결제 스위치백(Partner Switchback URL) 스텁.
 * 추후 쿼리 파라미터·세션에 맞춰 POS/주문 완료 화면으로 리다이렉트 가능.
 */
export default function PaymentReturnPage() {
  return (
    <main className="min-h-[40vh] flex flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">결제 처리</h1>
      <p className="text-sm text-muted-foreground max-w-md">
        결제 창에서 돌아온 페이지입니다. 연동 설정이 완료되면 여기서 주문·결제 상태를 확인할 수 있습니다.
      </p>
    </main>
  )
}
