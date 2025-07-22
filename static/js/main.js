// static/js/main.js

document.addEventListener("DOMContentLoaded", () => {
    if (typeof auth !== 'undefined' && typeof db !== 'undefined') {
        auth.onAuthStateChanged((user) => { handleAuthState(user); });
    } else {
        console.error("CRITICAL: Firebase libraries did not load. Check script tags in HTML.");
    }
});

function handleAuthState(user) {
    const currentPage = window.location.pathname;
    const isAuthPage = ['/login', '/register', '/'].includes(currentPage);
    const isProtectedPage = ['/home', '/dashboard', '/learn', '/quiz'].includes(currentPage) || currentPage.startsWith('/review/');
    
    if (user) {
        if (isAuthPage) { 
            window.location.href = '/home'; 
            return; 
        }
        if (document.getElementById('welcome-message')) { setupNav(user); }
        if (currentPage === '/home') initializeHomePage(user);
        if (currentPage === '/learn') initializeChat(user);
        if (currentPage === '/quiz') initializeQuiz(user);
        if (currentPage === '/dashboard') initializeDashboard(user);
        if (currentPage.startsWith('/review/')) initializeReviewPage(user);
    } else {
        if (isProtectedPage) { 
            window.location.href = '/login'; 
        }
    }
}

function setupNav(user) {
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');
    if (welcomeMessage && logoutButton) {
        welcomeMessage.textContent = user.email;
        logoutButton.style.display = 'block';
        logoutButton.onclick = (e) => { e.preventDefault(); auth.signOut(); };
    }
}

// *** THIS IS THE CORRECTED CODE BLOCK FOR LOGIN ***
if (document.getElementById('login-form')) {
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                console.log("Login successful! Redirecting...");
                window.location.href = '/home'; 
            })
            .catch((error) => {
                // FAILED! Show a specific, user-friendly error message.
                
                // STEP 1: Always log the technical error to the console for debugging.
                console.error("Login Error Details:", error);

                let errorMessage;
                switch (error.code) {
                    // STEP 2: Handle all "invalid credential" errors with one simple message.
                    case 'auth/wrong-password':
                    case 'auth/user-not-found':
                    case 'auth/invalid-credential': // This is a common modern error code
                        errorMessage = "Login Failed: The email or password you entered is incorrect.";
                        break;
                    case 'auth/invalid-email':
                        errorMessage = "Login Failed: The email address format is not valid.";
                        break;
                    case 'auth/too-many-requests':
                        errorMessage = "Access to this account has been temporarily disabled due to many failed login attempts. You can reset your password or try again later.";
                        break;
                    default:
                        // STEP 3: A better generic message for any other error.
                        errorMessage = "Login Failed. Password Incorrect. Please try again.";
                }
                alert(errorMessage);
            });
    });
}


if (document.getElementById('register-form')) {
    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                alert("Account created successfully! You will now be redirected to the login page.");
                window.location.href = '/login';
            })
            .catch((error) => {
                let errorMessage;
                switch (error.code) {
                    case 'auth/email-already-in-use':
                        errorMessage = "Registration Failed: This email address is already in use.";
                        break;
                    case 'auth/weak-password':
                        errorMessage = "Registration Failed: Password should be at least 6 characters long.";
                        break;
                    case 'auth/invalid-email':
                        errorMessage = "Registration Failed: The email address is not valid.";
                        break;
                    default:
                        errorMessage = "Registration Failed. An unexpected error occurred. Please try again.";
                }
                alert(errorMessage);
            });
    });
}

function initializeHomePage(user) {
    const welcomeHeader = document.getElementById('home-welcome-header');
    if (welcomeHeader) { welcomeHeader.textContent = `Welcome, ${user.email}!`; }
}

// ... the rest of your main.js file remains the same ...
let chatInitialized = false;
function initializeChat(user) {
    if (chatInitialized) return;
    chatInitialized = true;
    const chatLog = document.getElementById('chat-log');
    const inputForm = document.getElementById('input-form');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const newTopicBtn = document.getElementById('new-topic-btn');
    const takeQuizBtn = document.getElementById('take-quiz-btn');
    
    let conversationHistory = [];
    let sessionTopic = null;

    function addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        messageDiv.innerText = text;
        chatLog.appendChild(messageDiv);
        chatLog.scrollTop = chatLog.scrollHeight;
        return messageDiv;
    }

    function setupNewSession() {
        sessionTopic = null;
        conversationHistory = [];
        chatLog.innerHTML = '';
        addMessage("What subject would you like to start a lesson on today?", 'ai');
        userInput.placeholder = "Enter a topic to start...";
        newTopicBtn.style.display = 'none';
        takeQuizBtn.style.display = 'none';
        sendBtn.disabled = false;
    }
    
    newTopicBtn.addEventListener('click', setupNewSession);

    takeQuizBtn.addEventListener('click', async () => {
        if (!sessionTopic || conversationHistory.length < 4) {
            alert("Please have a slightly longer conversation to generate a good quiz!");
            return;
        }
        takeQuizBtn.disabled = true;
        takeQuizBtn.textContent = "Saving...";
        try {
            const token = await user.getIdToken(true);
            const response = await fetch('/save-lesson', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ topic: sessionTopic, conversation: conversationHistory })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Server responded with an error: ' + response.status);
            }
            console.log("Lesson saved successfully via backend.");
            sessionStorage.setItem('conversationForQuiz', JSON.stringify(conversationHistory));
            sessionStorage.setItem('topicForQuiz', sessionTopic);
            sessionStorage.setItem('conversationLengthForQuiz', conversationHistory.length);
            window.location.href = '/quiz';
        } catch (error) {
            console.error("Error during lesson save process:", error);
            alert(`Could not save your lesson: ${error.message}`);
            takeQuizBtn.disabled = false;
            takeQuizBtn.textContent = "Take Quiz!";
        }
    });

    inputForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (sendBtn.disabled) return;
        const userText = userInput.value.trim();
        if (!userText) return;
        sendBtn.disabled = true;

        if (!sessionTopic) {
            sessionTopic = userText;
            chatLog.innerHTML = '';
            addMessage(userText, 'user');
            userInput.placeholder = `Ask a question about ${sessionTopic}...`;
            newTopicBtn.style.display = 'inline-block';
            takeQuizBtn.style.display = 'inline-block';
        } else {
            addMessage(userText, 'user');
        }
        
        conversationHistory.push({ role: 'user', content: userText });
        userInput.value = '';
        const thinkingMessage = addMessage('Thinking...', 'thinking');
        
        try {
            const token = await user.getIdToken(true);
            const res = await fetch('/ask-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ topic: sessionTopic, messages: conversationHistory })
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({error: "Failed to parse error."}));
                throw new Error(errorData.error || `Server error ${res.status}`);
            }
            const data = await res.json();
            
            thinkingMessage.remove();
            const aiMessage = { role: 'assistant', content: data.response };
            addMessage(aiMessage.content, 'ai');
            conversationHistory.push(aiMessage);
        } catch (err) {
            thinkingMessage.remove();
            addMessage(`Sorry, an error occurred: ${err.message}`, 'ai');
        } finally {
            sendBtn.disabled = false;
            userInput.focus();
        }
    });
    setupNewSession();
}

let quizInitialized = false;
let allQuestions = [];
let userAnswers = [];
let currentQuestionIndex = 0;
let currentTopic = '';

function initializeQuiz(user) {
    if (quizInitialized) return;
    quizInitialized = true;
    const conversationJSON = sessionStorage.getItem('conversationForQuiz');
    const topicFromSession = sessionStorage.getItem('topicForQuiz');
    const conversationLength = sessionStorage.getItem('conversationLengthForQuiz');

    if (conversationJSON && topicFromSession && conversationLength) {
        const conversation = JSON.parse(conversationJSON);
        generateAndRunQuiz(user, topicFromSession, conversation, parseInt(conversationLength, 10));
        sessionStorage.removeItem('conversationForQuiz');
        sessionStorage.removeItem('topicForQuiz');
        sessionStorage.removeItem('conversationLengthForQuiz');
    } else {
        alert("To get a quiz, you must first have a conversation with the AI tutor.");
        window.location.href = '/learn';
    }
}

async function generateAndRunQuiz(user, topic, conversation, conversationLength) {
    const quizMainEl = document.getElementById('quiz-main');
    const quizStatusEl = document.getElementById('quiz-status');
    const nextBtn = document.getElementById('next-question-btn');
    quizStatusEl.textContent = `Generating a personalized quiz on "${topic}"...`;
    quizStatusEl.style.display = 'block';
    quizMainEl.style.display = 'none';
    document.getElementById('results-container').style.display = 'none';
    currentTopic = topic;

    try {
        const token = await user.getIdToken(true);
        const res = await fetch("/generate-quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
            body: JSON.stringify({ topic, conversation, conversationLength }),
        });
        if (!res.ok) { throw new Error(`Server error: ${res.status}`); }
        const data = await res.json();
        if (data.error) { throw new Error(data.error); }
        
        const mcQuestions = data.quiz_content.multiple_choice.map(q => ({...q, type: 'multiple_choice'}));
        const enumQuestions = data.quiz_content.enumeration.map(q => ({...q, type: 'enumeration'}));
        allQuestions = [...mcQuestions, ...enumQuestions];
        
        userAnswers = [];
        currentQuestionIndex = 0;
        
        quizStatusEl.style.display = 'none';
        quizMainEl.style.display = 'block';
        nextBtn.onclick = () => handleNextQuestion();
        displayQuestion();
    } catch (error) {
        quizStatusEl.textContent = `Failed to load quiz: ${error.message}`;
        console.error(error);
    }
}

function displayQuestion() {
    if (currentQuestionIndex >= allQuestions.length) {
        showResults();
        return;
    }
    const questionContainer = document.getElementById('question-container');
    const nextBtn = document.getElementById('next-question-btn');
    const questionData = allQuestions[currentQuestionIndex];
    questionContainer.innerHTML = '';
    const questionText = document.createElement('p');
    questionText.textContent = `Q${currentQuestionIndex + 1}: ${questionData.question}`;
    questionContainer.appendChild(questionText);

    if (questionData.type === 'multiple_choice') {
        const choicesDiv = document.createElement('div');
        choicesDiv.className = 'choices';
        questionData.choices.forEach((choice, idx) => {
            const choiceLabel = document.createElement('label');
            const choiceValue = String.fromCharCode(65 + idx);
            choiceLabel.innerHTML = `<input type="radio" name="answer" value="${choiceValue}"> <span>${choiceValue}. ${choice}</span>`;
            choicesDiv.appendChild(choiceLabel);
        });
        questionContainer.appendChild(choicesDiv);
    } else if (questionData.type === 'enumeration') {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'enumeration-answer';
        input.className = 'quiz-text-input';
        input.placeholder = 'Type your answer here...';
        questionContainer.appendChild(input);
    }
    nextBtn.textContent = (currentQuestionIndex === allQuestions.length - 1) ? 'Finish Quiz' : 'Next →';
}

function handleNextQuestion() {
    const questionData = allQuestions[currentQuestionIndex];
    let userAnswer = null;
    if (questionData.type === 'multiple_choice') {
        const checkedRadio = document.querySelector('input[name="answer"]:checked');
        if (!checkedRadio) { alert("Please select an answer."); return; }
        userAnswer = checkedRadio.value;
    } else if (questionData.type === 'enumeration') {
        const inputField = document.getElementById('enumeration-answer');
        if (!inputField.value.trim()) { alert("Please type an answer."); return; }
        userAnswer = inputField.value.trim();
    }
    userAnswers[currentQuestionIndex] = userAnswer;
    currentQuestionIndex++;
    displayQuestion();
}

async function showResults() {
    const user = auth.currentUser;
    if (!user) return;

    document.getElementById('quiz-main').style.display = 'none';
    const resultsContainer = document.getElementById('results-container');
    const finalScoreEl = document.getElementById('final-score');
    resultsContainer.style.display = 'block';

    let score = 0;

    allQuestions.forEach((question, i) => {
        const userAnswer = userAnswers[i];

        if (question.type === 'multiple_choice') {
            const userChoiceIndex = userAnswer.charCodeAt(0) - 'A'.charCodeAt(0);
            const correctChoiceIndex = question.correct.charCodeAt(0) - 'A'.charCodeAt(0);
            const userChoiceText = question.choices[userChoiceIndex];
            const correctChoiceText = question.choices[correctChoiceIndex];

            if (userChoiceText === correctChoiceText) {
                score++;
            }
        } else if (question.type === 'enumeration') {
            if (userAnswer.toLowerCase() === question.answer.toLowerCase()) {
                score++;
            }
        }
    });

    const totalQuestions = allQuestions.length;
    finalScoreEl.textContent = `Your Score: ${score} / ${totalQuestions}`;

    try {
        const resultsRef = db.collection('users').doc(user.uid).collection('quiz_results');
        await resultsRef.add({
            topic: currentTopic,
            score: score,
            totalQuestions: totalQuestions,
            date: firebase.firestore.FieldValue.serverTimestamp(),
            questions: allQuestions,
            userAnswers: userAnswers
        });
    } catch (error) {
        console.error("Error saving quiz result: ", error);
    }
}


let dashboardInitialized = false;
async function initializeDashboard(user) {
    if (dashboardInitialized) return;
    dashboardInitialized = true;
    const totalLessonsEl = document.getElementById('total-lessons-stat');
    const averageScoreEl = document.getElementById('average-score-stat');
    const historyTableBody = document.getElementById('history-table-body');
    const historyTable = document.getElementById('history-table');
    const loadingStatus = document.getElementById('history-loading-status');
    try {
        const lessonsRef = db.collection('users').doc(user.uid).collection('lessons');
        const quizResultsRef = db.collection('users').doc(user.uid).collection('quiz_results').orderBy('date', 'desc');
        const [lessonsSnapshot, quizSnapshot] = await Promise.all([lessonsRef.get(), quizResultsRef.get()]);
        const lessonCount = lessonsSnapshot.size;
        totalLessonsEl.textContent = lessonCount;
        if (quizSnapshot.empty) {
            loadingStatus.textContent = "You haven't completed any quizzes yet.";
            if (lessonCount === 0) { loadingStatus.textContent = "You haven't started any lessons yet. Go to the Learn tab!"; }
            averageScoreEl.textContent = 'N/A';
            return;
        }
        let totalScore = 0;
        let totalPossibleScore = 0;
        historyTableBody.innerHTML = '';
        quizSnapshot.forEach(doc => {
            const result = doc.data();
            totalScore += result.score;
            totalPossibleScore += result.totalQuestions;
            const date = result.date.toDate().toLocaleDateString();
            const scoreText = `${result.score} / ${result.totalQuestions}`;
            const row = document.createElement('tr');
            row.innerHTML = `<td>${date}</td><td>${result.topic}</td><td>${scoreText}</td>`;
            const actionsCell = document.createElement('td');
            if (result.questions && result.questions.length > 0) {
                const reviewButton = document.createElement('button');
                reviewButton.className = 'button-secondary';
                reviewButton.textContent = 'Review';
                reviewButton.addEventListener('click', () => { window.location.href = `/review/${doc.id}`; });
                actionsCell.appendChild(reviewButton);
            } else {
                actionsCell.innerHTML = `<button class="button-secondary" disabled>N/A</button>`;
            }
            row.appendChild(actionsCell);
            historyTableBody.appendChild(row);
        });
        if (totalPossibleScore > 0) {
            const averagePercent = Math.round((totalScore / totalPossibleScore) * 100);
            averageScoreEl.textContent = `${averagePercent}%`;
        } else {
            averageScoreEl.textContent = 'N/A';
        }
        loadingStatus.style.display = 'none';
        historyTable.style.display = 'table';
    } catch (error) {
        console.error("Error loading dashboard:", error);
        loadingStatus.textContent = "Could not load your dashboard data.";
    }
}

async function initializeReviewPage(user) {
    const quizId = window.location.pathname.split('/').pop();
    if (!quizId) { window.location.href = '/dashboard'; return; }
    const reviewHeader = document.getElementById('review-header');
    const loadingStatus = document.getElementById('review-loading-status');
    const reviewContent = document.getElementById('review-content');
    try {
        const docRef = db.collection('users').doc(user.uid).collection('quiz_results').doc(quizId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) { throw new Error("Quiz result not found."); }
        const data = docSnap.data();
        reviewHeader.textContent = `Review for: ${data.topic} (Score: ${data.score}/${data.totalQuestions})`;
        let reviewHTML = '';
        if (data.questions && Array.isArray(data.questions)) {
            data.questions.forEach((question, index) => {
                const userAnswer = data.userAnswers[index] || "No answer";
                let isCorrect = false;
                let correctAnswerText = '';
                let userAnswerText = '';

                if (question.type === 'multiple_choice') {
                    const correctIndex = question.correct.charCodeAt(0) - 65;
                    const userIndex = userAnswer.charCodeAt(0) - 65;
                    const choices = question.choices || [];

                    correctAnswerText = `${question.correct}. ${choices[correctIndex] || 'Unknown'}`;
                    userAnswerText = `${userAnswer}. ${choices[userIndex] || 'Unknown'}`;

                    isCorrect = choices[userIndex] === choices[correctIndex];
                } else if (question.type === 'enumeration') {
                    isCorrect = userAnswer.toLowerCase() === question.answer.toLowerCase();
                    correctAnswerText = question.answer;
                    userAnswerText = userAnswer;
                }

                const resultClass = isCorrect ? 'correct' : 'incorrect';
                reviewHTML += `<div class="review-item ${resultClass}">
                    <p class="review-question">Q${index + 1}: ${question.question}</p>
                    <p class="review-user-answer">Your Answer: ${userAnswerText}</p>
                    ${!isCorrect ? `<p class="review-correct-answer">Correct Answer: ${correctAnswerText}</p>` : ''}
                </div>`;
            });
        }
        reviewContent.innerHTML = reviewHTML;
        loadingStatus.style.display = 'none';
        reviewContent.style.display = 'block';
    } catch (error) {
        console.error("Error loading quiz review:", error);
        loadingStatus.textContent = `Could not load quiz review: ${error.message}`;
    }
}