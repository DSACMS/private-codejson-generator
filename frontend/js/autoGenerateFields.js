// This works by creating an object with methods for different notification types of either error or success
// Calling either of these methods calls the main functionality, show(), which manipulates the notification element in HTML
// The show() method changes the element based on type and displays the message to the user
// The hide() function makes sure that the notification fades away after 5 seconds
const notificationSystem = {
    show: function (message, type = 'error') {
        const notification = document.getElementById('notification');
        const notificationHeading = document.querySelector('.usa-alert__heading')
        const messageElement = document.querySelector('.usa-alert__text');

        messageElement.textContent = message;

        if (type === 'error') {
            notification.classList.add("usa-alert--error");
            notification.classList.remove("usa-alert--success");
            notificationHeading.textContent = "Error";
        } else {
            notification.classList.add("usa-alert--success");
            notification.classList.remove("usa-alert--error");
            notificationHeading.textContent = "Success";
        }

        notification.style.display = 'block';
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 10);

        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.hide(), 5000);
    },

    hide: function () {
        const notification = document.getElementById('notification');
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 500);
    },

    error: function (message) {
        this.show(message, 'error');
    },

    success: function (message) {
        this.show(message, 'success');
    },
};

function setupNotificationSystem() {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.5s ease';
    }
}


// CONFIGURATION
const API_CONFIG = {
    BASE_URL: 'https://1qf9jjbd64.execute-api.us-gov-west-1.amazonaws.com',
    ENDPOINTS: {
        INITIATE: '/auth/initiate',
        CALLBACK: '/auth/callback',
        GET_REPOS: '/repos'
    }
};

const AUTH_STORAGE_KEY = 'github_oauth_session';

function getAuthToken() {
    return localStorage.getItem(AUTH_STORAGE_KEY);
}

function setAuthToken(token) {
    localStorage.setItem(AUTH_STORAGE_KEY, token);
}

function clearAuthToken() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
}

function isAuthenticated() {
    return !!getAuthToken();
}


// OAUTH FLOW HANDLING
async function handleOAuthCallback() {
    console.log('handleOAuthCallback called!');
    console.log('Current URL:', window.location.href);

    const urlParams = new URLSearchParams(window.location.search);
    const sessionToken = urlParams.get('session');
    console.log('Session token from URL:', sessionToken);

    try {
        if (sessionToken) {
            setAuthToken(sessionToken);
            notificationSystem.success('Successfully connected to GitHub!');
            
            window.history.replaceState({}, document.title, window.location.pathname);
            
            initializeAuthUI();
            await fetchUserRepositories();
        }
    } catch (error) {
        console.error('OAuth callback error:', error);
        notificationSystem.error(error.message);
    }
}

function initiateGitHubOAuth() {
    const initiateUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.INITIATE}`;
    window.location.href = initiateUrl;
}

function disconnectGitHub() {
    clearAuthToken();
    notificationSystem.success('Disconnected from GitHub');
    initializeAuthUI();
}


// REPOSITORY FETCHING
async function fetchUserRepositories() {
    const sessionToken = getAuthToken();
    
    if (!sessionToken) {
        console.error('No session token available');
        return;
    }

    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_REPOS}`, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch repositories');
        }

        const data = await response.json();
        populateRepoDropdown(data.repositories || []);
        
    } catch (error) {
        console.error('Error fetching repositories:', error);
        notificationSystem.error('Failed to load repositories. Please try reconnecting.');
    }
}


// UI STUFF
function populateRepoDropdown(repositories) {
    const dropdown = document.getElementById('repo-dropdown');
    dropdown.innerHTML = '<option value="">Select a repository</option>';

    repositories.forEach(repo => {
        const option = document.createElement('option');
        option.value = repo.html_url || repo.url;
        option.textContent = repo.full_name || repo.name;
        dropdown.appendChild(option);
    });
}

function initializeAuthUI() {
    const authContainer = document.getElementById('auth-status-container');
    const publicForm = document.getElementById('github-url-form');
    const privateSection = document.getElementById('private-repo-section');

    if (isAuthenticated()) {
        authContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                <span style="color: #00a91c; font-weight: bold;">✓ Connected to GitHub</span>
                <button class="usa-button usa-button--outline usa-button--inverse" 
                        type="button" 
                        onclick="disconnectGitHub()"
                        style="padding: 5px 15px; font-size: 14px;">
                    Disconnect
                </button>
            </div>
            <p><i>Select a repository from your account</i></p>
        `;
        
        privateSection.style.display = 'block';
        publicForm.style.display = 'block';
        
        fetchUserRepositories();
        
    } else {
        authContainer.innerHTML = `
            <div style="margin-bottom: 15px;">
                <button class="usa-button" type="button" onclick="initiateGitHubOAuth()">
                    Connect GitHub Account
                </button>
                <p style="margin-top: 10px;"><i>Connect your GitHub account to access private repositories</i></p>
            </div>
        `;
        
        privateSection.style.display = 'none';
        publicForm.style.display = 'block';
    }
}


// API CALLS
async function getRepoInformationAuth(repoInfo) {
    const sessionToken = getAuthToken();
    const baseURL = "https://api.github.com/repos/";
    const endpoint = `${baseURL}${repoInfo.organization}/${repoInfo.repository}`;

    try {
        const headers = {
            'Accept': 'application/vnd.github.v3+json'
        };

        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
        }
        
        const response = await fetch(endpoint, { headers });

        if (!response.ok) {
            throw new Error(`GitHub API error (${response.status}): ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Fetch error:", error.message);
        throw error;
    }
}

async function getRepoLanguagesAuth(repoInfo) {
    const sessionToken = getAuthToken();
    const endpoint = `https://api.github.com/repos/${repoInfo.organization}/${repoInfo.repository}/languages`;

    try {
        const headers = {
            'Accept': 'application/vnd.github.v3+json'
        };

        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
        }
        
        const response = await fetch(endpoint, { headers });

        if (!response.ok) {
            throw new Error(`GitHub API error (${response.status}): ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Fetch error:", error.message);
        throw error;
    }
}


// FORM HANDLING
function setupDropdownHandler() {
    const dropdownButton = document.getElementById('repo-dropdown-button');
    
    dropdownButton.addEventListener('click', async function(event) {
        event.preventDefault();
        
        const dropdown = document.getElementById('repo-dropdown');
        const repoURL = dropdown.value;
        
        if (!repoURL) {
            notificationSystem.error('Please select a repository');
            return;
        }
        
        dropdownButton.textContent = 'Loading...';
        dropdownButton.disabled = true;
        
        try {
            const repoInfo = extractGitHubInfo(repoURL);
            
            if (!repoInfo) {
                throw new Error('Invalid repository selection');
            }
            
            const repositoryInfo = await getRepoInformationAuth(repoInfo);
            const languages = await getRepoLanguagesAuth(repoInfo);
            
            if (repositoryInfo) {
                preFillFields(repositoryInfo, languages);
                notificationSystem.success('Repository data loaded successfully!');
            } else {
                throw new Error('Could not fetch repository information');
            }
            
        } catch (error) {
            console.error(error.message);
            notificationSystem.error(error.message);
        } finally {
            dropdownButton.textContent = 'Submit';
            dropdownButton.disabled = false;
        }
    })
}

function setupFormHandler() {
    const form = document.getElementById("github-url-form");

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const submitButton = document.getElementById("repo-url-button");

        submitButton.value = "Loading...";
        submitButton.disabled = true;

        try {
            const repoURL = document.getElementById("repo-url").value;

            if (repoURL.length == 0) {
                throw new Error("Please enter a GitHub repository URL");
            }

            const repoInfo = extractGitHubInfo(repoURL);

            if (!repoInfo) {
                throw new Error("Invalid GitHub URL format. Please enter a valid GitHub repository URL ->(https://github.com/username/repository)");
            }

            const repositoryInfo = await getRepoInformation(repoInfo);
            const languages = await getRepoLanguages(repoInfo)

            if (repositoryInfo) {
                preFillFields(repositoryInfo, languages);
                notificationSystem.success("Repository data loaded successfully!");
            } else {
                throw new Error("Could not fetch repository information. Please check the URL and try again.");
            }

        } catch (error) {
            console.error(error.message);
            notificationSystem.error(error.message);
        } finally {
            submitButton.value = "Submit";
            submitButton.disabled = false;
        }
    });
}

// REPO INFO STUFF
function extractGitHubInfo(url) {
    // Regex pattern to match GitHub URLs and extract org and repo
    const regex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/\s]+)/;
    const match = url.match(regex);

    if (match && match.length === 3) {
        return {
            organization: match[1],
            repository: match[2]
        };
    }

    return null;
}

async function getRepoInformation(repoInfo) {
    const baseURL = "https://api.github.com/repos/";
    const endpoint = `${baseURL}${repoInfo.organization}/${repoInfo.repository}`;

    try {
        const response = await fetch(endpoint);

        if (!response.ok) {
            throw new Error(`GitHub API error (${response.status}): ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Fetch error:", error.message);
    }
}

async function getRepoLanguages(repoInfo) {
    const endpoint = `https://api.github.com/repos/${repoInfo.organization}/${repoInfo.repository}/languages`

    try {
        const response = await fetch(endpoint);

        if (!response.ok) {
            throw new Error(`GitHub API error (${response.status}): ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Fetch error:", error.message);
    }
}

async function getLicenseURL(repoURL) {
    const urlParts = repoURL.replace('https://github.com/', '').split('/')
    const owner = urlParts[0]
    const repo = urlParts[1]

    try {
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`
        const response = await fetch(apiUrl)

        const files = await response.json()

        const licenseFile = files.find(file => {
            const fileName = file.name.toLowerCase()
            return fileName.startsWith('license')
        })

        if (licenseFile) {
            return `${repoURL}/blob/main/${licenseFile.name}`
        }

        return `${repoURL}/blob/main/LICENSE`

    } catch (error) {
        console.error('Could not check license via API:', error.message)
        return `${repoURL}/blob/main/LICENSE`
    }
}

async function preFillFields(repoData, languages) {
    if (!window.formIOInstance) {
        notificationSystem.error("Form interface not initialized. Please refresh and try again.");
        return;
    }

    try {
        const form = window.formIOInstance

        // Updating VCS to git - typically always be git 
        form.getComponent('vcs').setValue('git')

        // Updating organization - only option available
        form.getComponent('organization').setValue('Centers for Medicare & Medicaid Services')

        // Updating visibility
        form.getComponent('repositoryVisibility').setValue(repoData.private ? 'private' : 'public')

        // Updating name
        if (repoData.name) {
            form.getComponent('name').setValue(repoData.name)
        }

        // Updating description
        if (repoData.description) {
            form.getComponent('description').setValue(repoData.description)
        }

        // Updating URL
        if (repoData.html_url) {
            if (repoData.private) {
                // Private repositories must have "private" as their repositoryURL value
                form.getComponent('repositoryURL').setValue("private")
            }
            else {
                form.getComponent('repositoryURL').setValue(repoData.html_url)
            }
        }

        // Updating forks
        if (repoData.forks_count !== undefined) {
            const reuseFrequencyComp = form.getComponent('reuseFrequency')
            const currentReuse = {}

            currentReuse.forks = repoData.forks_count
            reuseFrequencyComp.setValue(currentReuse)
        }

        // Updating license object
        if (repoData.license && repoData.license.spdx_id) {
            const permissionsComp = form.getComponent('permissions');
            const currentPermissions = permissionsComp.getValue() || {};

            currentPermissions.licenses = currentPermissions.licenses || [];
            const licenseURL = await getLicenseURL(repoData.html_url)

            const licenseObj = {
                name: repoData.license.spdx_id,
                URL: licenseURL
            };

            currentPermissions.licenses = [licenseObj];
            permissionsComp.setValue(currentPermissions);
        }

        // Update languages list by combining any the user has entered
        if (form.getComponent('languages') && languages) {
            const languagesComp = form.getComponent('languages')
            const newLanguages = Object.keys(languages) || []

            languagesComp.setValue(newLanguages)
        }

        // Update dates
        if (repoData.created_at && repoData.updated_at) {
            const dateComp = form.getComponent('date')
            const currentDate = dateComp.getValue() || {}

            currentDate.created = repoData.created_at;
            currentDate.lastModified = repoData.updated_at
            currentDate.metadataLastUpdated = new Date().toISOString()

            dateComp.setValue(currentDate)
        }

        // Update tags
        if (repoData.topics) {
            const tagsComp = form.getComponent('tags')

            const newTags = [...repoData.topics] || []
            tagsComp.setValue(newTags)
        }

        // Update feedback mechanisms
        if (repoData.html_url) {
            const feedbackComp = form.getComponent('feedbackMechanism')

            const issuesUrl = repoData.html_url + "/issues"

            feedbackComp.setValue(issuesUrl)
        }

        // Update SBOM
        if (form.getComponent('SBOM') && repoData.html_url) {
            const upstreamComp = form.getComponent('SBOM');
            const urlParts = repoData.html_url.split('/')

            if (urlParts.length >= 2) {
                const org = urlParts[urlParts.length - 2]
                const repo = urlParts[urlParts.length - 1]

                const dependenciesUrl = `https://github.com/${org}/${repo}/network/dependencies`

                upstreamComp.setValue(dependenciesUrl)
            }
        }

        // Update repositoryHost
        if (form.getComponent('repositoryHost') && repoData.html_url) {
            if (repoData.html_url.includes('github.cms.gov')) {
                form.getComponent('repositoryHost').setValue('github.cms.gov')
            } else if (repoData.html_url.includes('github.com/CMSgov')) {
                form.getComponent('repositoryHost').setValue('github.com/CMSgov')
            } else if (repoData.html_url.includes('github.com/CMS-Enterprise')) {
                form.getComponent('repositoryHost').setValue('github.com/CMS-Enterprise')
            } else if (repoData.html_url.includes('github.com/DSACMS')) {
                form.getComponent('repositoryHost').setValue('github.com/DSACMS')
            }
        }

        // fields to potentially automate
        // clones, but this is only tracked for every 14 days 
        // status, by checking if its public, we can assume its production and check if its archival 
        // laborHours, by running a script? this might be harder since we need SCC
        // maturityModel, we could check to see if certain files / sections live within a repo and make a guess like that
        // usageType, by assuming that if its public = openSource and if private = governmnetWideReuse

        notificationSystem.success("Repository data loaded successfully!")

    } catch (error) {
        notificationSystem.error("Error filling form fields with repository data. Please refresh and try again")
        console.error("Form fill error:", error)
    }
}

// This is global so we could use this throughout the website!
window.showErrorNotification = function (message) {
    notificationSystem.error(message);
};

window.showSuccessNotification = function (message) {
    notificationSystem.success(message);
};

window.initiateGitHubOAuth = initiateGitHubOAuth;
window.disconnectGitHub = disconnectGitHub;

document.addEventListener("DOMContentLoaded", function () {
    setupFormHandler();
    setupNotificationSystem();
    initializeAuthUI();
    handleOAuthCallback();
    setupDropdownHandler();
});