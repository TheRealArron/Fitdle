// src/app/page.js
import Fitdle from './components/Fitdle';  // Relative path
  // Adjust the path if necessary

export default function Home() {
  return (
    <div>
      <h1>Welcome to Fitdle!</h1>
      <Fitdle />  {/* This will render the Fitdle component */}
    </div>
  );
}
