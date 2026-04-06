import { forwardRef } from 'react';
import HomePage from './HomePage';

const Index = forwardRef<HTMLDivElement>((_, ref) => <HomePage ref={ref} />);
Index.displayName = 'Index';

export default Index;
