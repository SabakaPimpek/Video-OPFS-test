// Zegarek z milisekundami – idealny do testowania płynności
    setInterval(() => {
      const now = new Date();
      document.getElementById('clock').textContent = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    }, 30);
