import { STATUS_LABEL, type AnyStatus } from '../labels.ts'

// 상태색: 초안 회색, 승인·완료 초록, 확인 필요·실행 중 주황, 반려·실패 빨강
export default function StatusBadge({ status }: { status: AnyStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status] ?? status}</span>
}
