import { Redirect } from 'expo-router';

/** The to-do list lives on Home now; old links land there. */
export default function Tasks() {
  return <Redirect href="/" />;
}
