import { BundleGate } from '../content/BundleGate'
import PeopleScreen from '../people/PeopleScreen'

export default function PeopleRoute() {
  return <BundleGate render={(bundle) => <PeopleScreen bundle={bundle} />} />
}
