import type { Canon } from '../schema.ts'

const isApproved = (item: { status: string }) => item.status === 'approved'

// 사람이 승인한 항목만 남긴 설정집. 장면을 쓰고 검수할 때는 이것만 기준으로 삼는다. 변경 제안은 그대로 둔다.
export function approvedCanon(canon: Canon): Canon {
  return {
    characters: canon.characters.filter(isApproved),
    places: canon.places.filter(isApproved),
    eras: canon.eras.filter(isApproved),
    things: canon.things.filter(isApproved),
    proposals: canon.proposals,
  }
}
