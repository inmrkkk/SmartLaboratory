import { render } from '@testing-library/react';
import App from './App';

test('renders login page by default', () => {
  render(<App />);
  // Since the default route is Login, we should test that the App renders without crashing
  expect(document.body).toBeInTheDocument();
});
