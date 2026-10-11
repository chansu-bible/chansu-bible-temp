import { BundleGate } from '../content/BundleGate'
import NotesScreen from '../notes/NotesScreen'

export default function NotesRoute() {
  return <BundleGate render={(bundle) => <NotesScreen bundle={bundle} />} />
}
