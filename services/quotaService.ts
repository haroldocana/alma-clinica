import { Psychologist } from '../types';

export const getAvailableMessages = (user: Psychologist): number => {
  const disponiblesPlan = Math.max(0, (user.mensajesPlanMensual || 0) - (user.mensajesConsumidosMes || 0));
  return disponiblesPlan + (user.mensajesBolsonExtra || 0);
};

export const consumeMessageCredit = (
  currentUser: Psychologist,
  setPsychologists: React.Dispatch<React.SetStateAction<Record<string, Psychologist>>>,
  setCurrentUser: React.Dispatch<React.SetStateAction<Psychologist | null>>
): boolean => {
  if (getAvailableMessages(currentUser) <= 0) return false;

  const disponiblesPlan = (currentUser.mensajesPlanMensual || 0) - (currentUser.mensajesConsumidosMes || 0);
  let nuevosConsumidos = currentUser.mensajesConsumidosMes || 0;
  let nuevosExtras = currentUser.mensajesBolsonExtra || 0;

  if (disponiblesPlan > 0) {
    nuevosConsumidos += 1;
  } else {
    nuevosExtras -= 1;
  }

  const updatedUser: Psychologist = {
    ...currentUser,
    mensajesConsumidosMes: nuevosConsumidos,
    mensajesBolsonExtra: nuevosExtras,
  };

  setCurrentUser(updatedUser);
  setPsychologists((prev) => {
    const updatedDb = { ...prev, [updatedUser.username]: updatedUser };
    localStorage.setItem('psychologists_db', JSON.stringify(updatedDb));
    localStorage.setItem('current_logged_psychologist', JSON.stringify(updatedUser));
    return updatedDb;
  });

  return true;
};

export const refundMessageCredit = (
  currentUser: Psychologist,
  setPsychologists: React.Dispatch<React.SetStateAction<Record<string, Psychologist>>>,
  setCurrentUser: React.Dispatch<React.SetStateAction<Psychologist | null>>
) => {
  let nuevosConsumidos = currentUser.mensajesConsumidosMes || 0;
  let nuevosExtras = currentUser.mensajesBolsonExtra || 0;

  if (nuevosConsumidos > 0) {
    nuevosConsumidos -= 1;
  } else {
    nuevosExtras += 1;
  }

  const updatedUser: Psychologist = {
    ...currentUser,
    mensajesConsumidosMes: nuevosConsumidos,
    mensajesBolsonExtra: nuevosExtras,
  };

  setCurrentUser(updatedUser);
  setPsychologists((prev) => {
    const updatedDb = { ...prev, [updatedUser.username]: updatedUser };
    localStorage.setItem('psychologists_db', JSON.stringify(updatedDb));
    localStorage.setItem('current_logged_psychologist', JSON.stringify(updatedUser));
    return updatedDb;
  });
};
