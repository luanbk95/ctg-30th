document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registrationForm');
    const messageDiv = document.getElementById('formMessage');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Collect form data
        const formData = {
            name: form.name.value,
            graduationYear: form.graduationYear.value,
            phone: form.phone.value,
            email: form.email.value,
            attending: form.attending.value
        };

        try {
            // Send data to the server
            const response = await fetch('/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();
            if (result.status === 'success') {
                messageDiv.textContent = 'Thank you for registering! We have received your information.';
                messageDiv.style.color = 'green';
                form.reset();
            } else {
                messageDiv.textContent = 'There was an issue submitting your form. Please try again later.';
                messageDiv.style.color = 'red';
            }
        } catch (error) {
            messageDiv.textContent = 'An error occurred. Please try again later.';
            messageDiv.style.color = 'red';
        }
    });
});