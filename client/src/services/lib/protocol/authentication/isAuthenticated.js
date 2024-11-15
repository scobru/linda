import { Subject, BehaviorSubject } from 'rxjs';
import { gun, user } from '../../../state';

let isAuthenticated = new BehaviorSubject(false);
let authCheckInProgress = false;

let checkAuth = () => {
  if (authCheckInProgress) return;
  authCheckInProgress = true;

  console.log('Checking auth status:', user.is); // Debug log
  
  if (user.is) {
    isAuthenticated.next(true);
    authCheckInProgress = false;
    return true;
  } else {
    isAuthenticated.next(false);
    authCheckInProgress = false;
    return false;
  }
};

if (gun) {
  gun.on('auth', () => {
    console.log('Auth event triggered, user:', user.is); // Debug log
    if (user.is) {
      isAuthenticated.next(true);
    }
  });
}

export { isAuthenticated, checkAuth };
