
CREATE TABLE Categories (
    Category_ID SERIAL PRIMARY KEY,
    Category_Name VARCHAR(50) NOT NULL
);


CREATE TABLE Skills (
    Skill_ID SERIAL PRIMARY KEY,
    Category_ID INT,
    Skill_Name VARCHAR(100) NOT NULL,
    Description TEXT,
    Hourly_Rate DECIMAL(10, 2),
    FOREIGN KEY (Category_ID) REFERENCES Categories(Category_ID) ON DELETE SET NULL
);


CREATE TABLE Users (
    User_ID SERIAL PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    Password VARCHAR(255) NOT NULL,
    Location VARCHAR(100),
    Phone_No VARCHAR(15),
    Email VARCHAR(100) NOT NULL UNIQUE,
    Time_Credits DECIMAL(10, 2) DEFAULT 0.0
);


CREATE TABLE User_Skills (
    User_ID INT,
    Skill_ID INT,
    PRIMARY KEY (User_ID, Skill_ID),
    FOREIGN KEY (User_ID) REFERENCES Users(User_ID) ON DELETE CASCADE,
    FOREIGN KEY (Skill_ID) REFERENCES Skills(Skill_ID) ON DELETE CASCADE
);


CREATE TABLE Admins (
    Admin_ID SERIAL PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    Password VARCHAR(255) NOT NULL
);


CREATE TABLE Transactions (
    Transaction_ID SERIAL PRIMARY KEY,
    Hours_Traded DECIMAL(5, 2) CHECK (Hours_Traded > 0),
    Time_Completed TIMESTAMP,
    Status VARCHAR(20) CHECK (Status IN ('Pending', 'Completed', 'Cancelled')) DEFAULT 'Pending',
    Notes TEXT,
    Dispute_Status BOOLEAN DEFAULT FALSE,
    Resolved_By INT,
    FOREIGN KEY (Resolved_By) REFERENCES Admins(Admin_ID) ON DELETE SET NULL
);


CREATE TABLE User_Transactions (
    User_ID INT,
    Transaction_ID INT,
    Role VARCHAR(20) CHECK (Role IN ('Provider', 'Receiver')) NOT NULL,
    PRIMARY KEY (User_ID, Transaction_ID),
    FOREIGN KEY (User_ID) REFERENCES Users(User_ID) ON DELETE CASCADE,
    FOREIGN KEY (Transaction_ID) REFERENCES Transactions(Transaction_ID) ON DELETE CASCADE
);


CREATE TABLE Reviews (
    Review_ID SERIAL PRIMARY KEY,
    Transaction_ID INT,
    Reviewer_ID INT,
    Reviewed_User_ID INT,
    Rating INT CHECK (Rating >= 1 AND Rating <= 5),
    Comments TEXT,
    Review_Date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (Transaction_ID) REFERENCES Transactions(Transaction_ID) ON DELETE CASCADE,
    FOREIGN KEY (Reviewer_ID) REFERENCES Users(User_ID) ON DELETE SET NULL,
    FOREIGN KEY (Reviewed_User_ID) REFERENCES Users(User_ID) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS Notifications (
    notification_id UUID PRIMARY KEY,
    user_id VARCHAR REFERENCES Users(user_id), -- Match the type to Users
    message TEXT NOT NULL,
    related_id UUID,
    type VARCHAR(50) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);